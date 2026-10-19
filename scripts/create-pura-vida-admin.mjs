import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2Sync } from 'node:crypto';

const projectRef = 'qsvdpdifygmzdawxfyqv';
const baseUrl = `https://${projectRef}.supabase.co`;
const username = 'puravida';
const password = process.env.PURA_VIDA_BOOTSTRAP_PASSWORD;
if (!password) throw new Error('PURA_VIDA_BOOTSTRAP_PASSWORD is required.');

// Keep project credentials in memory; never print or save them.
const keyResult = JSON.parse(execFileSync('supabase', [
  'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
const keys = Array.isArray(keyResult) ? keyResult : (keyResult.api_keys ?? keyResult.keys ?? []);
const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
const anonKey = keys.find(key => key.name === 'anon')?.api_key;
if (!serviceKey || !anonKey) throw new Error('Required project API keys are unavailable.');

async function request(path, { method = 'GET', body, key = serviceKey, extraHeaders = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Do not include response bodies that could contain tokens or password hashes.
    throw new Error(`${method} ${path.split('?')[0]} failed (${response.status}): ${data?.code ?? data?.error_code ?? 'request_error'}`);
  }
  return data;
}

const profiles = await request(`/rest/v1/user_profiles?select=id,username,role&username=eq.${username}`);
const authUsers = await request('/auth/v1/admin/users?page=1&per_page=50');
if (process.argv.includes('--verify-only')) {
  const existingUser = authUsers.users?.find(user => user.id === profiles[0]?.id);
  if (profiles.length !== 1 || !existingUser) throw new Error('Expected administrator was not found.');
  await verifyAdmin(existingUser);
  process.exit(0);
}
if (profiles.length) throw new Error('The puravida profile already exists; refusing to overwrite it.');
if (authUsers.users?.some(user => user.user_metadata?.normalized_username === username || user.user_metadata?.username === username)) {
  throw new Error('An Auth user named puravida already exists; refusing to create a duplicate.');
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 210000, 32, 'sha256');
const passwordHash = `pbkdf2_sha256$210000$${salt.toString('base64')}$${hash.toString('base64')}`;
const email = `${username}-${Date.now()}@local.app`;
const authUser = await request('/auth/v1/admin/users', {
  method: 'POST',
  body: {
    email, password, email_confirm: true,
    user_metadata: { username, normalized_username: username, role: 'admin', player_id: null },
  },
});
if (!authUser.id) throw new Error('Auth creation returned no user ID.');

try {
  await request('/rest/v1/user_profiles', {
    method: 'POST',
    body: { id: authUser.id, username, role: 'admin', is_active: true, player_id: null, password_hash: passwordHash, password_updated_at: new Date().toISOString() },
    extraHeaders: { Prefer: 'return=minimal' },
  });
} catch (error) {
  // Remove only the Auth identity created by this invocation if its profile fails.
  await request(`/auth/v1/admin/users/${authUser.id}`, { method: 'DELETE' });
  throw error;
}

await request(`/auth/v1/admin/users/${authUser.id}`, {
  method: 'PUT',
  body: { user_metadata: { ...authUser.user_metadata, profile_id: authUser.id } },
});

// Verify the supplied password through Supabase Auth and use that session to read
// the same profile the application loads. Tokens are never printed or persisted.
await verifyAdmin(authUser);

async function verifyAdmin(authUser) {
const session = await request('/auth/v1/token?grant_type=password', {
  method: 'POST', key: anonKey, body: { email: authUser.email, password },
});
if (session.user?.id !== authUser.id || !session.access_token) throw new Error('Login verification failed.');
const sessionHeaders = { Authorization: `Bearer ${session.access_token}` };
let profile;
try {
  const verifiedProfiles = await request(`/rest/v1/user_profiles?select=id,username,role,is_active&id=eq.${authUser.id}`, {
    key: anonKey, extraHeaders: sessionHeaders,
  });
  profile = verifiedProfiles[0];
  if (profile?.role !== 'admin' || profile?.username !== username || !profile?.is_active) {
    throw new Error('Administrator profile verification failed.');
  }
} finally {
  await request('/auth/v1/logout?scope=local', { method: 'POST', key: anonKey, extraHeaders: sessionHeaders });
}
console.log(JSON.stringify({ project: projectRef, username, role: profile.role, active: profile.is_active, passwordLoginVerified: true, sessionProfileVerified: true }));
}
