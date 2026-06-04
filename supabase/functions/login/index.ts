import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LoginRequest {
  username: string;
  password: string;
}

const PASSWORD_ITERATIONS = 210000;
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256,
  );

  return new Uint8Array(bits);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsValue, saltValue, hashValue] = storedHash.split("$");

  if (algorithm !== "pbkdf2_sha256" || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const expectedHash = base64ToBytes(hashValue);
  const actualHash = await derivePasswordHash(password, base64ToBytes(saltValue), iterations);
  return timingSafeEqual(actualHash, expectedHash);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { username, password }: LoginRequest = await req.json();
    const normalizedUsername = normalizeUsername(username || "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("npm:@supabase/supabase-js@2.53.1");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let userProfile = null;
    let profileError = null;

    const usernameCandidates = Array.from(new Set([
      username,
      username?.trim?.(),
      normalizedUsername,
    ].filter((value): value is string => Boolean(value))));

    for (const candidate of usernameCandidates) {
      const result = await supabaseAdmin
        .from("user_profiles")
        .select("id, username, role, player_id, is_active, password_hash")
        .eq("username", candidate)
        .maybeSingle();

      userProfile = result.data;
      profileError = result.error;

      if (userProfile || profileError) {
        break;
      }
    }

    if (profileError) {
      return new Response(JSON.stringify({ error: "Error buscando usuario" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userProfile) {
      return new Response(JSON.stringify({ error: "Usuario no encontrado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userProfile.is_active) {
      return new Response(JSON.stringify({ error: "El usuario esta inactivo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError || !users) {
      return new Response(JSON.stringify({ error: "Error buscando usuarios Auth" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let authUser = users.find((user: any) =>
      user.id === userProfile.id ||
      user.user_metadata?.username === userProfile.username ||
      user.user_metadata?.normalized_username === normalizeUsername(userProfile.username)
    );

    if (userProfile.password_hash) {
      const passwordMatches = await verifyPassword(password, userProfile.password_hash);

      if (!passwordMatches) {
        return new Response(JSON.stringify({ error: "Usuario o contrasena incorrectos" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (!authUser?.email) {
        return new Response(JSON.stringify({ error: "Contrasena no configurada para este usuario" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { createClient: createAnonClient } = await import("npm:@supabase/supabase-js@2.53.1");
      const supabaseAnon = createAnonClient(supabaseUrl, anonKey);
      const { error: passwordError } = await supabaseAnon.auth.signInWithPassword({
        email: authUser.email,
        password,
      });

      if (passwordError) {
        return new Response(JSON.stringify({ error: "Usuario o contrasena incorrectos" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: hashUpdateError } = await supabaseAdmin
        .from("user_profiles")
        .update({
          password_hash: await hashPassword(password),
          password_updated_at: new Date().toISOString(),
        })
        .eq("id", userProfile.id);

      if (hashUpdateError) {
        throw hashUpdateError;
      }
    }

    const metadata = {
      profile_id: userProfile.id,
      username: userProfile.username,
      normalized_username: normalizeUsername(userProfile.username),
      role: userProfile.role,
      player_id: userProfile.player_id,
    };

    if (!authUser) {
      const uniqueEmail = `${normalizeUsername(userProfile.username)}-${Date.now()}@local.app`;
      const { data: createdAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: uniqueEmail,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (createAuthError || !createdAuthUser.user) {
        throw new Error(`Error creating auth user: ${createAuthError?.message || "Unknown error"}`);
      }

      authUser = createdAuthUser.user;
    } else {
      const { data: updatedAuthUser, error: syncAuthError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        password,
        user_metadata: {
          ...authUser.user_metadata,
          ...metadata,
        },
      });

      if (syncAuthError) {
        throw syncAuthError;
      }

      authUser = updatedAuthUser.user || authUser;
    }

    const { error: lastLoginError } = await supabaseAdmin
      .from("user_profiles")
      .update({ last_login: new Date().toISOString() })
      .eq("id", userProfile.id);

    if (lastLoginError) {
      throw lastLoginError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userProfile.id,
          username: userProfile.username,
          email: authUser.email,
          role: userProfile.role,
          playerId: userProfile.player_id,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
