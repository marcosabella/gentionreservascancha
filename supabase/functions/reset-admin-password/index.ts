import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResetRequest {
  newPassword: string;
  resetToken?: string;
}

const PASSWORD_ITERATIONS = 210000;
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { newPassword, resetToken }: ResetRequest = await req.json();

    if (!newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "La contraseña debe tener al menos 6 caracteres",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing environment variables");
    }

    const supabaseClient = await import("npm:@supabase/supabase-js").then(
      (mod) => mod.createClient(supabaseUrl, serviceRoleKey)
    );

    // Get the first admin user
    const { data: adminUser, error: fetchError } = await supabaseClient
      .from("user_profiles")
      .select("id, username")
      .eq("role", "admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Error fetching admin user: ${fetchError.message}`);
    }

    if (!adminUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No hay usuario admin en el sistema",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const normalizedUsername = adminUser.username.trim().toLowerCase();
    const { error: profileUpdateError } = await supabaseClient
      .from("user_profiles")
      .update({
        password_hash: await hashPassword(newPassword),
        password_updated_at: new Date().toISOString(),
      })
      .eq("id", adminUser.id);

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    const { data: authUsersData, error: listError } = await supabaseClient.auth.admin.listUsers();

    if (listError) {
      throw new Error(`Error fetching auth users: ${listError.message}`);
    }

    const existingAuthUser = authUsersData.users.find((user: any) =>
      user.id === adminUser.id ||
      user.user_metadata?.username === adminUser.username ||
      user.user_metadata?.normalized_username === normalizedUsername
    );

    let adminEmail: string | undefined;

    if (existingAuthUser) {
      const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: newPassword,
          user_metadata: {
            ...existingAuthUser.user_metadata,
            profile_id: adminUser.id,
            username: adminUser.username,
            normalized_username: normalizedUsername,
            role: "admin",
          },
        }
      );

      if (updateError) {
        throw new Error(`Error updating password: ${updateError.message}`);
      }

      adminEmail = existingAuthUser.email;
    } else {
      const uniqueEmail = `${normalizedUsername}-${Date.now()}@local.app`;
      const { data: createdAuthUser, error: createError } = await supabaseClient.auth.admin.createUser({
        email: uniqueEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          profile_id: adminUser.id,
          username: adminUser.username,
          normalized_username: normalizedUsername,
          role: "admin",
        },
      });

      if (createError || !createdAuthUser.user) {
        throw new Error(`Error creating auth user: ${createError?.message || "Unknown error"}`);
      }

      adminEmail = createdAuthUser.user.email;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Contraseña del admin reseteada exitosamente",
        adminEmail,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Error interno del servidor",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
