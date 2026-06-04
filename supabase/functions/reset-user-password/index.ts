import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResetUserPasswordRequest {
  userId: string;
  newPassword: string;
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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const { userId, newPassword }: ResetUserPasswordRequest = await req.json();

    if (!userId || !newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'userId y una nueva contrasena valida son obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, username, role, player_id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedUsername = profile.username.trim().toLowerCase();
    const passwordHash = await hashPassword(newPassword);

    const { error: profileUpdateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        password_hash: passwordHash,
        password_updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    const authUser = users.find((user: any) =>
      user.id === profile.id ||
      user.user_metadata?.username === profile.username ||
      user.user_metadata?.normalized_username === normalizedUsername
    );

    if (authUser) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        password: newPassword,
        user_metadata: {
          ...authUser.user_metadata,
          profile_id: profile.id,
          username: profile.username,
          normalized_username: normalizedUsername,
          role: profile.role,
          player_id: profile.player_id,
        },
      });

      if (error) {
        throw error;
      }
    } else {
      const uniqueEmail = `${normalizedUsername}-${Date.now()}@local.app`;
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: uniqueEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          profile_id: profile.id,
          username: profile.username,
          normalized_username: normalizedUsername,
          role: profile.role,
          player_id: profile.player_id,
        },
      });

      if (error) {
        throw error;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error resetting user password:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
