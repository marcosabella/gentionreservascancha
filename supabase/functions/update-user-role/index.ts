import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UpdateUserRoleRequest {
  userId: string;
  role: 'admin' | 'player';
  playerId?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const { userId, role, playerId }: UpdateUserRoleRequest = await req.json();

    if (!userId || !role) {
      return new Response(
        JSON.stringify({ error: 'userId y role son obligatorios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (role === 'player' && !playerId) {
      return new Response(
        JSON.stringify({ error: 'Debe seleccionar un jugador para el rol de jugador' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
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
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (existingUser.role === 'admin' && role !== 'admin' && existingUser.is_active) {
      const { count: activeAdminCount, error: activeAdminCountError } = await supabaseAdmin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if (activeAdminCountError) {
        throw activeAdminCountError;
      }

      if ((activeAdminCount || 0) <= 1) {
        return new Response(
          JSON.stringify({ error: 'No puedes quitar el rol al ultimo administrador activo' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        role,
        player_id: role === 'player' ? playerId : null,
      })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
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
      const currentMetadata = authUser.user_metadata ?? {};
      const { error: metadataUpdateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...currentMetadata,
          profile_id: existingUser.id,
          username: existingUser.username,
          normalized_username: normalizedUsername,
          role,
          player_id: role === 'player' ? playerId : null,
        },
      });

      if (metadataUpdateError) {
        throw metadataUpdateError;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error updating user role:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
