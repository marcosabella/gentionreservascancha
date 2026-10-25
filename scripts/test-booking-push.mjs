import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(execFileSync('supabase', ['status', '--workdir', 'dev/pura-vida.local', '--output', 'json'], {
  encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
}));
assert.equal(config.API_URL, 'http://127.0.0.1:56000', 'Only use the isolated local database');
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_pura-vida-dev', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], {
  input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
if (sql("SELECT to_regclass('public.booking_push_subscriptions') IS NULL").trim() === 't') {
  sql(readFileSync('supabase/migrations/20261023150000_booking_web_push.sql', 'utf8'));
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const run = randomUUID(), users = [], clients = [], notifications = [];
const password = `${randomUUID()}aA1!`;
async function ok(query) { const { data, error } = await query; assert.ifError(error && new Error(error.message)); return data; }
async function denied(query) { const { error } = await query; assert(error, 'Unauthorized operation unexpectedly succeeded'); }
async function account(role) {
  const username = `push_${role}_${randomUUID().slice(0, 8)}`;
  const { user } = await ok(service.auth.admin.createUser({ email: `${username}@example.invalid`, password, email_confirm: true }));
  users.push(user.id);
  await ok(service.from('user_profiles').insert({ id: user.id, username, role, is_active: true, password_hash: 'unused-test' }));
  const client = createClient(config.API_URL, config.ANON_KEY, options); clients.push(client);
  await ok(client.auth.signInWithPassword({ email: user.email, password }));
  return { id: user.id, client };
}
function subscription(suffix = randomUUID()) {
  const key = createECDH('prime256v1'); key.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/test-${run}-${suffix}`, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
const register = (account, sub) => account.client.rpc('register_booking_push', { subscription: sub });
const savedConfig = await ok(service.from('booking_push_config').select('*'));
assert.equal(sql("SELECT count(*) FROM vault.secrets WHERE name = 'booking_push_dispatch_token'").trim(), '0', 'Local test must not have real dispatcher secrets');
try {
  await ok(service.from('booking_push_config').upsert({ singleton: true, public_key: 'A'.repeat(87), app_url: 'https://example.invalid', enabled: true }));
  const admin = await account('admin'), second = await account('admin'), employee = await account('employee'), player = await account('player');
  const anon = createClient(config.API_URL, config.ANON_KEY, options);
  for (const client of [employee.client, player.client, anon]) {
    await denied(client.rpc('booking_push_settings'));
    await denied(client.rpc('register_booking_push', { subscription: subscription() }));
    await denied(client.rpc('claim_booking_push'));
    await denied(client.rpc('finish_booking_push', { job: randomUUID(), claim: randomUUID(), result_status: 201 }));
  }
  const one = subscription(), two = subscription();
  const subId = await ok(register(admin, one));
  assert.equal(await ok(register(admin, one)), subId, 'Registration is idempotent');
  await denied(register(second, one));
  await ok(register(second, two));
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com@evil.test/x', 'https://fcm.googleapis.com:444/x']) {
    await denied(register(admin, { ...one, endpoint }));
  }
  await denied(register(admin, { ...one, keys: { p256dh: 'bad', auth: 'bad' } }));
  await denied(admin.client.from('booking_push_subscriptions').select('*'));
  await denied(admin.client.from('booking_push_subscriptions').insert({ user_id: admin.id, endpoint: one.endpoint, p256dh: one.keys.p256dh, auth: one.keys.auth }));
  await ok(second.client.rpc('unregister_booking_push', { address: one.endpoint }));
  assert(await ok(service.from('booking_push_subscriptions').select('id').eq('id', subId).maybeSingle()), 'Cannot unsubscribe another administrator');

  async function event(kind) {
    const data = await ok(service.from('booking_notifications').insert({ actor_id: player.id, kind, player_name: 'Jugador de prueba', court_name: 'Cancha de prueba', booking_date: '2031-03-01', start_time: '10:00', end_time: '11:30' }).select('id').single());
    notifications.push(data.id); return data.id;
  }
  const created = await event('created');
  assert.equal((await ok(service.from('booking_push_deliveries').select('id').eq('notification_id', created))).length, 2);
  const [first, other] = await Promise.all([ok(service.rpc('claim_booking_push')), ok(service.rpc('claim_booking_push'))]);
  const jobs = [...first, ...other].filter(job => job.notificationId === created);
  assert.equal(jobs.length, 2); assert.equal(new Set(jobs.map(job => job.id)).size, 2, 'Concurrent claims never duplicate');
  const sent = jobs.find(job => job.subscriptionId === subId), retry = jobs.find(job => job.subscriptionId !== subId);
  await ok(service.rpc('finish_booking_push', { job: sent.id, claim: randomUUID(), result_status: 201 }));
  assert.equal((await ok(service.from('booking_push_deliveries').select('state').eq('id', sent.id).single())).state, 'sending', 'Wrong lease cannot acknowledge');
  await ok(service.rpc('finish_booking_push', { job: sent.id, claim: sent.lease, result_status: 201 }));
  await ok(service.rpc('finish_booking_push', { job: retry.id, claim: retry.lease, result_status: 503 }));
  assert.equal((await ok(service.from('booking_push_deliveries').select('state').eq('id', retry.id).single())).state, 'queued');
  assert.equal((await ok(service.rpc('claim_booking_push'))).filter(job => job.notificationId === created).length, 0, 'Backoff respected; accepted push never resent');
  await ok(service.from('booking_push_deliveries').update({ next_attempt_at: '2000-01-01' }).eq('id', retry.id));
  const retried = (await ok(service.rpc('claim_booking_push'))).find(job => job.id === retry.id);
  assert(retried); assert.notEqual(retried.lease, retry.lease);
  await ok(service.rpc('finish_booking_push', { job: retried.id, claim: retried.lease, result_status: 410 }));
  assert.equal(await ok(service.from('booking_push_subscriptions').select('id').eq('endpoint', two.endpoint).maybeSingle()), null, 'Expired endpoint removed');
  const cancelled = await event('cancelled');
  const pending = (await ok(service.rpc('claim_booking_push'))).find(job => job.notificationId === cancelled);
  assert.equal(pending.kind, 'cancelled');
  // Simulate a crashed worker: the lease becomes eligible again, then stops at its retry cap.
  await ok(service.from('booking_push_deliveries').update({ next_attempt_at: '2000-01-01' }).eq('id', pending.id));
  assert((await ok(service.rpc('claim_booking_push'))).some(job => job.id === pending.id));
  await ok(service.from('booking_push_deliveries').update({ attempts: 5, next_attempt_at: '2000-01-01' }).eq('id', pending.id));
  assert(!(await ok(service.rpc('claim_booking_push'))).some(job => job.id === pending.id));
  assert.equal((await ok(service.from('booking_push_deliveries').select('state').eq('id', pending.id).single())).state, 'failed');

  await ok(service.from('user_profiles').update({ is_active: false }).eq('id', admin.id));
  assert.equal(await ok(service.from('booking_push_subscriptions').select('id').eq('id', subId).maybeSingle()), null, 'Disabled account subscriptions removed');
  await denied(register(admin, one));
  const secondSub = await ok(register(second, subscription()));
  await ok(service.from('user_profiles').update({ role: 'employee' }).eq('id', second.id));
  assert.equal(await ok(service.from('booking_push_subscriptions').select('id').eq('id', secondSub).maybeSingle()), null, 'Role change revokes subscriptions');
  await ok(service.from('user_profiles').update({ role: 'admin' }).eq('id', second.id));
  const logoutSub = await ok(register(second, subscription()));
  await ok(second.client.auth.signOut({ scope: 'local' }));
  // GoTrue may remove sessions asynchronously: explicitly verify eventual revocation.
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!await ok(service.from('booking_push_subscriptions').select('id').eq('id', logoutSub).maybeSingle())) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await ok(service.from('booking_push_subscriptions').select('id').eq('id', logoutSub).maybeSingle()), null, 'Auth logout cascades even without frontend cleanup');
  console.log('PASS: admin-only registration, active sessions, RLS, endpoint validation, individual devices, atomic queue, concurrent leases, retry/backoff, expired endpoints, cancellations, role changes and logout.');
} finally {
  await service.from('booking_notifications').delete().in('id', notifications);
  for (const client of clients) await client.auth.signOut();
  for (const id of users) await service.auth.admin.deleteUser(id);
  if (savedConfig.length) await service.from('booking_push_config').upsert(savedConfig[0]);
  else await service.from('booking_push_config').delete().eq('singleton', true);
}
