import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserRequest {
  username: string;
  password: string;
  playerId?: string;
  role: 'admin' | 'player';
}

const normalizeUsername = (value: string) => value.trim().toLowerCase();
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
    const { username, password, playerId, role }: CreateUserRequest = await req.json();
    const trimmedUsername = username.trim();
    const normalizedUsername = normalizeUsername(username);

    if (!trimmedUsername) {
      return new Response(
        JSON.stringify({ error: 'El nombre de usuario es obligatorio' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the admin client
    const supabaseAdmin = await getSupabaseAdminClient();

    // Check if username already exists using raw SQL to bypass RLS
    let existingUser = null;
    try {
      const { data: existingUsers, error: checkError } = await supabaseAdmin.rpc(
        'check_username_exists',
        { input_username: trimmedUsername }
      ).catch(() => ({ data: null, error: null }));

      // If RPC doesn't exist, fall back to direct query
      if (existingUsers === null) {
        const { data, error } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .in('username', [trimmedUsername, normalizedUsername])
          .maybeSingle();

        if (error) {
          console.error('Error checking username:', error);
          // Even if there's an error, allow the creation to proceed
          // The unique constraint will catch duplicates
        }
        existingUser = data;
      } else {
        existingUser = existingUsers ? { id: existingUsers } : null;
      }
    } catch (selectError: any) {
      console.error('Database error checking username, proceeding:', selectError);
      // Proceed anyway, the unique constraint will catch it
    }

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'El nombre de usuario ya está en uso' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate unique email using username + random suffix
    const uniqueEmail = `${normalizedUsername}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@local.app`;

    // Create user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: uniqueEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: trimmedUsername,
        normalized_username: normalizedUsername,
        role,
        player_id: playerId || null,
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: 'User creation failed' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if profile already exists
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileCheckError) {
      console.error('Error checking profile:', profileCheckError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: profileCheckError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const profilePayload = {
      username: trimmedUsername,
      player_id: playerId || null,
      role: role,
      is_active: true,
      password_hash: await hashPassword(password),
      password_updated_at: new Date().toISOString(),
    };

    const profileQuery = existingProfile
      ? supabaseAdmin.from('user_profiles').update(profilePayload).eq('id', authData.user.id)
      : supabaseAdmin.from('user_profiles').insert({ id: authData.user.id, ...profilePayload });

    const { error: profileError } = await profileQuery;

    if (profileError) {
      console.error('Error saving profile:', profileError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
  return createClient(supabaseUrl, supabaseServiceKey);
}
