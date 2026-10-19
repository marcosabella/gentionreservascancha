// Administrative functions use service_role internally, so validate the caller
// explicitly before any privileged action. Role comes from the database.
export async function authorizeFunction(req: Request, mode: 'admin' | 'self-password' = 'admin') {
  const deny = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return deny(401, 'Sesion requerida');
  const { createClient } = await import('npm:@supabase/supabase-js@2.53.1');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return deny(401, 'Sesion invalida');
  const { data: profile, error: profileError } = await admin.from('user_profiles')
    .select('id,role,is_active').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.is_active) return deny(403, 'Usuario inactivo o sin permisos');
  if (profile.role === 'admin') return null;
  if (mode === 'self-password') {
    const body = await req.clone().json().catch(() => null);
    if (body?.userId === user.id) return null;
  }
  return deny(403, 'Se requiere administrador');
}
