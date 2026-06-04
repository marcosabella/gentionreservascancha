import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteUserRequest {
  userId: string;
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

    const { userId }: DeleteUserRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId es obligatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, username, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (existingUserError) {
      throw existingUserError;
    }

    if (!existingUser) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingUser.role === 'admin' && existingUser.is_active) {
      const { count, error: countError } = await supabaseAdmin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if (countError) {
        throw countError;
      }

      if ((count || 0) <= 1) {
        return new Response(
          JSON.stringify({ error: 'No puedes eliminar el ultimo administrador activo' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', existingUser.id);

    if (profileDeleteError) {
      throw profileDeleteError;
    }

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    const normalizedUsername = existingUser.username?.trim().toLowerCase();
    const authUser = users.find((user: any) =>
      user.id === existingUser.id ||
      user.user_metadata?.username === existingUser.username ||
      user.user_metadata?.normalized_username === normalizedUsername
    );

    if (authUser) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);

      if (deleteAuthError) {
        throw deleteAuthError;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error deleting user:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
