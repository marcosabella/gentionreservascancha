import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

if (process.argv.includes('--site-only')) {
  const url = 'https://complejopuravida.netlify.app';
  const response = await fetch(url);
  const html = await response.text();
  const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
  if (!response.ok || !assetPath) throw new Error('Published site HTML is invalid.');
  const asset = await fetch(new URL(assetPath, url));
  const bundle = await asset.text();
  if (!asset.ok || !bundle.includes('qsvdpdifygmzdawxfyqv') || bundle.includes('zcixnnzxxkylotbjudhk') || !bundle.includes('PURA VIDA')) {
    throw new Error('Published bundle does not match Pura Vida.');
  }
  const groupedSidebar = ['Calendario de reservas', 'Listado de reservas', 'Ventas y cobros', 'Productos y precios', 'Usuarios y permisos']
    .every(label => bundle.includes(label));
  if (!groupedSidebar) throw new Error('Published bundle is missing the approved navigation.');
  const checks = { url, status: response.status, assetStatus: asset.status, puraVidaDatabase: true, padelCenterReference: false, branding: true, groupedSidebar, verifiedAt: new Date().toISOString() };
  writeFileSync('supabase/pura-vida-public-site-verification.json', JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify(checks));
  process.exit(0);
}

const projectRef = 'qsvdpdifygmzdawxfyqv';
const baseUrl = `https://${projectRef}.supabase.co`;
const password = process.env.PURA_VIDA_BOOTSTRAP_PASSWORD;
if (!password) throw new Error('Verification password must be supplied in memory.');
const result = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
const keys = Array.isArray(result) ? result : result.api_keys;
const anonKey = keys.find(key => key.name === 'anon')?.api_key;
if (!anonKey) throw new Error('Public key unavailable.');
async function request(path, { method = 'GET', body, token = anonKey } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
const login = await request('/functions/v1/login', { method: 'POST', body: { username: 'puravida', password } });
if (login.status !== 200 || login.data?.user?.role !== 'admin') throw new Error(`Application login failed (${login.status}).`);
const native = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: login.data.user.email, password } });
if (native.status !== 200 || !native.data?.access_token) throw new Error(`Session creation failed (${native.status}).`);
const token = native.data.access_token;
const checks = { projectRef, applicationLogin: true, authSession: true, verifiedAt: new Date().toISOString() };
try {
  const profile = await request(`/rest/v1/user_profiles?select=id,username,role,is_active&id=eq.${native.data.user.id}`, { token });
  if (profile.status !== 200 || profile.data?.[0]?.role !== 'admin') throw new Error('Profile load failed.');
  checks.profile = true;
  const users = await request('/functions/v1/get-all-users', { token });
  if (users.status !== 200 || !users.data?.users?.some(user => user.username === 'puravida')) throw new Error(`User management failed (${users.status}).`);
  checks.userManagement = true;
  const tables = ['courts', 'players', 'consumable_categories', 'consumables', 'bookings', 'recurring_bookings', 'court_unavailabilities', 'tournaments', 'sales', 'current_account_entries', 'schedule_settings'];
  for (const table of tables) {
    const response = await request(`/rest/v1/${table}?select=*&limit=1`, { token });
    if (response.status !== 200 || !Array.isArray(response.data)) throw new Error(`Data loading failed for ${table} (${response.status}).`);
  }
  checks.applicationDataQueries = tables.length;
  const anonymousData = await request('/rest/v1/players?select=id&limit=1');
  if (anonymousData.status !== 401 && anonymousData.status !== 403) throw new Error('Anonymous data access was not blocked.');
  checks.anonymousDataBlocked = true;
  for (const functionName of ['get-all-users', 'create-user', 'update-user-role', 'delete-user', 'toggle-user-status', 'reset-user-password']) {
    const response = await request(`/functions/v1/${functionName}`, { method: functionName === 'get-all-users' ? 'GET' : 'POST', body: functionName === 'get-all-users' ? undefined : {} });
    if (response.status !== 401 && response.status !== 403) throw new Error(`Anonymous invocation was not blocked: ${functionName} (${response.status}).`);
  }
  checks.administrativeFunctionsProtected = 6;
  const hashes = await request('/rest/v1/user_profiles?select=password_hash', { token });
  if (hashes.status !== 401 && hashes.status !== 403) throw new Error('Password hash access was not blocked.');
  checks.passwordHashesProtected = true;
  const invalidLogin = await request('/functions/v1/login', { method: 'POST', body: { username: 'puravida', password: `${password}-invalid-check` } });
  if (invalidLogin.status !== 401) throw new Error('Invalid password was not rejected.');
  checks.invalidPasswordRejected = true;
} finally {
  await request('/auth/v1/logout?scope=local', { method: 'POST', token });
}
writeFileSync('supabase/pura-vida-release-verification.json', JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify(checks));
