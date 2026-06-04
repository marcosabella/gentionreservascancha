import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ToggleUserStatusRequest {
  userId: string;
  isActive: boolean;
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

    const { userId, isActive }: ToggleUserStatusRequest = await req.json();

    if (!userId || typeof isActive !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'userId e isActive son obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, role')
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

    if (!isActive && existingUser.role === 'admin') {
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
          JSON.stringify({ error: 'No puedes desactivar el ultimo administrador activo' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({ is_active: isActive })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error toggling user status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
