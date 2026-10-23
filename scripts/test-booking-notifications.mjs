import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(execFileSync('supabase', ['status', '--workdir', 'dev/pura-vida.local', '--output', 'json'], {
  encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
}));
assert.equal(config.API_URL, 'http://127.0.0.1:56000', 'Only use the isolated local database');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const run = randomUUID().slice(0, 8), password = `${randomUUID()}aA1!`;
const userIds = [], playerIds = [], sessions = [];
let court;
const triggerName = `notification_rollback_${run}`;
function localSql(sql) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_pura-vida-dev', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
async function ok(query, label = 'query') {
  const result = await query;
  assert.ifError(result.error && new Error(`${label}: ${result.error.message}`));
  return result.data;
}
async function denied(query, label) {
  const result = await query;
  assert(result.error || Array.isArray(result.data) && !result.data.length, `${label}: unexpectedly permitted`);
}
async function account(role, playerId = null) {
  const username = `notifications_${role}_${userIds.length}_${run}`;
  const { user } = await ok(service.auth.admin.createUser({ email: `${username}@example.invalid`, password, email_confirm: true }));
  userIds.push(user.id);
  await ok(service.from('user_profiles').insert({ id: user.id, username, role, player_id: playerId, is_active: true, password_hash: 'unused-test' }));
  const client = createClient(config.API_URL, config.ANON_KEY, options);
  await ok(client.auth.signInWithPassword({ email: user.email, password }));
  sessions.push(client);
  return { client, id: user.id };
}
const feed = client => ok(client.rpc('booking_notification_feed'));
try {
  const admin = await account('admin'), otherAdmin = await account('admin'), employee = await account('employee');
  const player = await ok(service.from('players').insert({ name: `Jugador ${run}`, email: `${run}@example.invalid`, phone: '000' }).select().single());
  playerIds.push(player.id);
  const actor = await account('player', player.id), noPlayer = await account('player');
  court = await ok(service.from('courts').insert({ name: `Avisos ${run}`, description: 'Prueba', price_per_turn: 1200, features: [] }).select().single());
  const payload = { courtId: court.id, courtName: 'Nombre falsificado', date: '2031-03-01', startTime: '10:00', endTime: '11:30', totalPrice: 1,
    status: 'confirmed', players: [{ id: player.id, name: 'Nombre falsificado', isOrganizer: true }], consumptions: [] };
  const notifications = () => ok(service.from('booking_notifications').select('*').in('actor_id', userIds));
  const baselineUnread = (await feed(admin.client)).unreadCount;
  await denied(employee.client.rpc('player_create_booking', { payload }), 'staff cannot use player RPC');
  await denied(noPlayer.client.rpc('player_create_booking', { payload }), 'unlinked player rejected');
  await denied(actor.client.rpc('player_create_booking', { payload: { ...payload, players: [{ id: randomUUID() }] } }), 'forged organizer rejected');
  await denied(actor.client.rpc('player_create_booking', { payload: { ...payload, consumptions: [{ id: 'fake' }] } }), 'invalid booking rejected');
  assert.equal((await notifications()).length, 0, 'Failed reservations do not generate notifications');

  // Force a failure after the parent and its notification have been inserted.
  localSql(`CREATE FUNCTION public.${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.player_id = '${player.id}'::uuid THEN RAISE EXCEPTION 'Test organizer failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER ${triggerName} BEFORE INSERT ON public.booking_players FOR EACH ROW EXECUTE FUNCTION public.${triggerName}();`);
  try {
    await denied(actor.client.rpc('player_create_booking', { payload }), 'child failure rolls back reservation');
    assert.equal((await notifications()).length, 0, 'Rollback removes the notification too');
    assert.equal((await ok(service.from('bookings').select('id').eq('court_id', court.id))).length, 0);
  } finally {
    localSql(`DROP TRIGGER IF EXISTS ${triggerName} ON public.booking_players; DROP FUNCTION IF EXISTS public.${triggerName}();`);
  }

  const id = await ok(actor.client.rpc('player_create_booking', { payload }), 'player reservation');
  const booking = await ok(service.from('bookings').select('*').eq('id', id).single());
  assert.equal(booking.total_price, 1200);
  assert.equal(booking.court_name, court.name);
  assert.equal((await ok(service.from('booking_players').select('*').eq('booking_id', id))).length, 1);
  let events = await notifications();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'created');
  assert.equal(events[0].player_name, player.name);
  assert.equal(events[0].court_name, court.name);
  await denied(actor.client.rpc('player_create_booking', { payload }), 'duplicate booking rejected');
  assert.equal((await notifications()).length, 1);

  await ok(actor.client.from('bookings').update({ status: 'cancelled' }).eq('id', id).select().single(), 'player cancellation');
  await ok(actor.client.from('bookings').update({ status: 'cancelled' }).eq('id', id).select().single(), 'repeated status save');
  events = await notifications();
  assert.equal(events.length, 2, 'Exactly one creation and one cancellation');
  assert(events.some(event => event.kind === 'cancelled'));
  const staffBooking = await ok(admin.client.from('bookings').insert({ court_id: court.id, court_name: court.name, date: '2031-03-01', start_time: '12:00', end_time: '13:30', total_price: 1200, status: 'confirmed' }).select().single());
  await ok(admin.client.from('bookings').update({ status: 'cancelled' }).eq('id', staffBooking.id).select().single());
  assert.equal((await notifications()).length, 2, 'Staff booking/cancellation does not alert');

  const firstFeed = await feed(admin.client);
  assert.equal(firstFeed.unreadCount, baselineUnread + 2);
  const target = events.find(event => event.kind === 'created').id;
  await ok(admin.client.rpc('mark_booking_notifications_read', { target }));
  assert.equal((await feed(admin.client)).unreadCount, baselineUnread + 1);
  assert.equal((await feed(otherAdmin.client)).items.find(item => item.id === target).is_read, false, 'Reads are per administrator');
  await ok(admin.client.rpc('mark_booking_notifications_read', { target }));
  assert.equal((await feed(admin.client)).unreadCount, baselineUnread + 1, 'Repeated marking is idempotent');
  for (const client of [actor.client, employee.client, noPlayer.client]) {
    await denied(client.rpc('booking_notification_feed'), 'notifications admin-only');
    await denied(client.rpc('mark_booking_notifications_read', { target }), 'marking admin-only');
    assert.deepEqual(await ok(client.from('booking_notifications').select('id')), [], 'RLS hides alerts');
  }
  await denied(actor.client.from('booking_notifications').insert({ ...events[0], id: randomUUID() }).select(), 'cannot forge notifications');
  await denied(admin.client.from('booking_notifications').update({ player_name: 'Forged' }).eq('id', target).select(), 'notification content immutable');
  const anonymous = createClient(config.API_URL, config.ANON_KEY, options);
  await denied(anonymous.rpc('booking_notification_feed'), 'anonymous access denied');

  const sameTimestamp = new Date().toISOString();
  await ok(service.from('booking_notifications').insert(Array.from({ length: 34 }, () => ({
    actor_id: actor.id, kind: 'created', player_name: player.name, court_name: court.name,
    booking_date: '2031-03-01', start_time: '10:00', end_time: '11:30', created_at: sameTimestamp,
  }))));
  const page = await feed(admin.client);
  assert.equal(page.items.length, 31);
  const cursor = page.items[29];
  const older = await ok(admin.client.rpc('booking_notification_feed', { before_at: cursor.created_at, before_id: cursor.id }));
  assert(!older.items.some(item => page.items.slice(0, 30).some(first => first.id === item.id)), 'Stable pagination with tied timestamps');
  assert(older.items.length >= 6);
  await ok(admin.client.rpc('mark_booking_notifications_read'));
  assert.equal((await feed(admin.client)).unreadCount, 0);
  assert((await feed(otherAdmin.client)).unreadCount >= 36);

  await ok(service.from('bookings').delete().eq('id', id));
  const preserved = (await notifications()).filter(event => event.id === target);
  assert.equal(preserved[0].booking_id, null, 'Deleting a booking preserves its notification snapshot');
  await ok(service.from('user_profiles').update({ is_active: false }).eq('id', admin.id));
  await denied(admin.client.rpc('booking_notification_feed'), 'disabled admin denied on existing token');
  console.log('PASS: player creation/cancellation, duplicates, atomic booking, actor attribution, staff exclusion, admin-only RLS, individual reads, pagination, snapshots, inactive accounts.');
} finally {
  localSql(`DROP TRIGGER IF EXISTS ${triggerName} ON public.booking_players; DROP FUNCTION IF EXISTS public.${triggerName}();`);
  await service.from('booking_notifications').delete().in('actor_id', userIds);
  if (court) {
    await service.from('bookings').delete().eq('court_id', court.id);
    await service.from('courts').delete().eq('id', court.id);
  }
  if (playerIds.length) await service.from('players').delete().in('id', playerIds);
  for (const client of sessions) await client.auth.signOut();
  for (const id of userIds) {
    await service.from('user_profiles').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
