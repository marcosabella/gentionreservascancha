import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type UserProfileRow = {
  id: string;
  username: string;
  role: string;
  player_id: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
};

type AuthUserMetadata = {
  profile_id?: string;
  username?: string;
};

type AuthUserRow = {
  id: string;
  last_sign_in_at?: string | null;
  user_metadata?: AuthUserMetadata;
};

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

    const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers();

    if (authUsersError) {
      console.error('Error fetching auth users:', authUsersError);
      return new Response(
        JSON.stringify({ error: 'Error fetching auth users' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, username, role, player_id, is_active, created_at, last_login')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return new Response(
        JSON.stringify({ error: 'Error fetching users' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authUsers = (authUsersData?.users ?? []) as AuthUserRow[];
    const users = (data as UserProfileRow[]).map((profile) => {
      const authUser = authUsers.find((user) =>
        user.id === profile.id ||
        user.user_metadata?.profile_id === profile.id ||
        user.user_metadata?.username === profile.username
      );

      return {
        id: profile.id,
        username: profile.username,
        password: '',
        role: profile.role,
        playerId: profile.player_id,
        isActive: profile.is_active,
        createdAt: profile.created_at,
        lastLogin: profile.last_login || authUser?.last_sign_in_at || null
      };
    });

    return new Response(
      JSON.stringify({ users }),
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
