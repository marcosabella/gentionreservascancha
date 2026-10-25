import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(execFileSync('supabase', ['status', '--workdir', 'dev/pura-vida.local', '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }));
assert.equal(config.API_URL, 'http://127.0.0.1:56000', 'Only use the isolated local database');
const sql = input => execFileSync('docker', ['exec','-i','supabase_db_pura-vida-dev','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-tA'], { input, encoding: 'utf8', windowsHide: true, stdio: ['pipe','pipe','pipe'] });
const migration = readFileSync('supabase/migrations/20261023170000_player_booking_reminders.sql', 'utf8');
if (sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='booking_push_config' AND column_name='reminder_minutes'").trim() === '0') sql(migration);
else for (const match of migration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.[\s\S]*?\$\$;/g)) sql(match[0].replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION'));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const users = [], players = [], sessions = [], password = `${randomUUID()}aA1!`;
async function ok(query) { const { data, error } = await query; assert.ifError(error && new Error(error.message)); return data; }
async function denied(query) { const { error } = await query; assert(error, 'Unauthorized request unexpectedly succeeded'); }
async function account(role, playerId = null) {
  const username = `reminder_${randomUUID().slice(0,8)}`;
  const { user } = await ok(service.auth.admin.createUser({ email: `${username}@example.invalid`, password, email_confirm: true })); users.push(user.id);
  await ok(service.from('user_profiles').insert({ id: user.id, username, role, player_id: playerId, is_active: true, password_hash: 'test-unused' }));
  const client = createClient(config.API_URL, config.ANON_KEY, options); sessions.push(client);
  const session = (await ok(client.auth.signInWithPassword({ email: user.email, password }))).session;
  return { id: user.id, client, sessionId: JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id };
}
const savedConfig = await ok(service.from('booking_push_config').select('*'));
try {
  await ok(service.from('booking_push_config').upsert({ singleton: true, enabled: true, public_key: 'A'.repeat(87), app_url: 'https://example.invalid', reminders_enabled: true, reminder_minutes: 60 }));
  for (let index=0;index<2;index++) players.push((await ok(service.from('players').insert({ name: `Jugador prueba ${randomUUID()}`,email:'test@example.invalid',phone:'000' }).select('id').single())).id);
  const admin = await account('admin'), player = await account('player', players[0]), unrelated = await account('player', players[1]), unlinked = await account('player'), employee = await account('employee');
  for (const actor of [player, unrelated]) {
    const settings = await ok(actor.client.rpc('booking_push_settings')); assert.equal(settings.reminderMinutes,60);
    const key = createECDH('prime256v1'); key.generateKeys();
    await ok(actor.client.rpc('register_booking_push',{subscription:{endpoint:`https://fcm.googleapis.com/reminder-${randomUUID()}`,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}}));
  }
  for (const actor of [player,unrelated,unlinked,employee]) {
    await denied(actor.client.rpc('update_booking_reminder_settings',{minutes_before:30,send_reminders:true}));
    await denied(actor.client.rpc('claim_booking_push'));
    await denied(actor.client.rpc('booking_push_job_current',{job:randomUUID(),claim:randomUUID()}));
    await denied(actor.client.from('booking_push_deliveries').select('*'));
  }
  await denied(unlinked.client.rpc('booking_push_settings'));
  await denied(employee.client.rpc('booking_push_settings'));
  for (const minutes of [0,4,1441]) await denied(admin.client.rpc('update_booking_reminder_settings',{minutes_before:minutes,send_reminders:true}));
  await ok(admin.client.rpc('update_booking_reminder_settings',{minutes_before:120,send_reminders:true}));
  assert.equal((await ok(player.client.rpc('booking_push_settings'))).reminderMinutes,120);
  await ok(admin.client.rpc('update_booking_reminder_settings',{minutes_before:60,send_reminders:true}));
  const booking = randomUUID(), court = randomUUID();
  sql(`BEGIN;
    SELECT set_config('request.jwt.claims','${JSON.stringify({ sub:admin.id,role:'authenticated',session_id:admin.sessionId })}',true);
    INSERT INTO public.courts(id,name,description,price_per_turn,features) VALUES('${court}','Cancha prueba','Prueba',1000,'{}');
    INSERT INTO public.bookings(id,court_id,court_name,date,start_time,end_time,total_price,status)
      SELECT '${booking}','${court}','Cancha prueba',t::date,t::time,(t+interval '90 minutes')::time,1000,'confirmed'
      FROM (SELECT (now()+interval '61 minutes') AT TIME ZONE 'America/Argentina/Buenos_Aires' AS t) x;
    INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer)
      VALUES('${booking}','${players[0]}','Jugador prueba','test@example.invalid','000',true);
    DO $test$ DECLARE job jsonb; original_lease uuid; found_count integer; BEGIN
      IF public.booking_push_start('2026-10-24','00:30') <> '2026-10-24T03:30:00Z'::timestamptz THEN RAISE EXCEPTION 'Argentina timezone mismatch'; END IF;
      PERFORM public.queue_booking_reminders();
      IF EXISTS(SELECT 1 FROM public.booking_push_deliveries WHERE booking_id='${booking}') THEN RAISE EXCEPTION 'Reminder sent early'; END IF;
      UPDATE public.bookings SET date=t::date,start_time=t::time FROM (SELECT (now()+interval '59 minutes') AT TIME ZONE 'America/Argentina/Buenos_Aires' t) x WHERE id='${booking}';
      PERFORM public.queue_booking_reminders(); PERFORM public.queue_booking_reminders();
      SELECT count(*) INTO found_count FROM public.booking_push_deliveries WHERE booking_id='${booking}';
      IF found_count<>1 THEN RAISE EXCEPTION 'Duplicate reminder or unrelated recipient'; END IF;
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      IF job IS NULL OR job->>'kind'<>'reminder' OR NOT public.booking_push_job_current((job->>'id')::uuid,(job->>'lease')::uuid) THEN RAISE EXCEPTION 'Reminder not claimable'; END IF;
      original_lease := (job->>'lease')::uuid;
      PERFORM public.update_booking_reminder_settings(30,true);
      IF public.booking_push_job_current((job->>'id')::uuid,original_lease) THEN RAISE EXCEPTION 'Old lease survives interval change'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.claim_booking_push()) value WHERE value->>'bookingId'='${booking}') THEN RAISE EXCEPTION 'Shorter interval sent early'; END IF;
      PERFORM public.update_booking_reminder_settings(120,true);
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      IF job IS NULL THEN RAISE EXCEPTION 'Longer interval not applied'; END IF;
      UPDATE public.bookings SET status='cancelled' WHERE id='${booking}';
      IF public.booking_push_job_current((job->>'id')::uuid,(job->>'lease')::uuid) THEN RAISE EXCEPTION 'Cancelled booking allowed'; END IF;
      PERFORM public.queue_booking_reminders();
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.claim_booking_push()) value WHERE value->>'bookingId'='${booking}') THEN RAISE EXCEPTION 'Cancelled booking claimed'; END IF;
      UPDATE public.bookings SET status='confirmed' WHERE id='${booking}';
      PERFORM public.queue_booking_reminders();
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      IF job IS NULL THEN RAISE EXCEPTION 'Reconfirmed booking lost'; END IF;
      UPDATE public.bookings SET date=t::date,start_time=t::time FROM (SELECT (now()+interval '180 minutes') AT TIME ZONE 'America/Argentina/Buenos_Aires' t) x WHERE id='${booking}';
      IF public.booking_push_job_current((job->>'id')::uuid,(job->>'lease')::uuid) THEN RAISE EXCEPTION 'Old time still allowed'; END IF;
      PERFORM public.queue_booking_reminders();
      UPDATE public.bookings SET date=t::date,start_time=t::time FROM (SELECT (now()+interval '100 minutes') AT TIME ZONE 'America/Argentina/Buenos_Aires' t) x WHERE id='${booking}';
      PERFORM public.queue_booking_reminders();
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      IF job IS NULL THEN RAISE EXCEPTION 'Rescheduled reminder not created'; END IF;
      PERFORM public.update_booking_reminder_settings(120,false);
      IF public.booking_push_job_current((job->>'id')::uuid,(job->>'lease')::uuid) THEN RAISE EXCEPTION 'Disabled reminder allowed'; END IF;
      PERFORM public.update_booking_reminder_settings(120,true);
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      PERFORM public.finish_booking_push((job->>'id')::uuid,(job->>'lease')::uuid,201);
      PERFORM public.queue_booking_reminders();
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.claim_booking_push()) value WHERE value->>'bookingId'='${booking}') THEN RAISE EXCEPTION 'Accepted reminder resent'; END IF;
      UPDATE public.bookings SET date=t::date,start_time=t::time FROM (SELECT (now()+interval '95 minutes') AT TIME ZONE 'America/Argentina/Buenos_Aires' t) x WHERE id='${booking}';
      SELECT value INTO job FROM jsonb_array_elements(public.claim_booking_push()) WHERE value->>'bookingId'='${booking}';
      DELETE FROM public.booking_players WHERE booking_id='${booking}';
      IF public.booking_push_job_current((job->>'id')::uuid,(job->>'lease')::uuid) THEN RAISE EXCEPTION 'Removed player still receives reminder'; END IF;
      PERFORM public.queue_booking_reminders();
      UPDATE public.bookings SET date=t::date,start_time=t::time FROM (SELECT (now()-interval '1 minute') AT TIME ZONE 'America/Argentina/Buenos_Aires' t) x WHERE id='${booking}';
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.claim_booking_push()) value WHERE value->>'bookingId'='${booking}') THEN RAISE EXCEPTION 'Past booking reminder claimed'; END IF;
    END $test$;
    ROLLBACK;`);
  console.log('PASS: linked-player subscriptions, admin-only configurable intervals, timezone/midnight, no early send, one delivery, unrelated-player exclusion, interval changes, cancellation, rescheduling, disabled reminders, removed players and past turns.');
} finally {
  for (const client of sessions) await client.auth.signOut();
  for (const id of users) await service.auth.admin.deleteUser(id);
  for (const id of players) await service.from('players').delete().eq('id',id);
  if (savedConfig.length) await service.from('booking_push_config').upsert(savedConfig[0]);
  else await service.from('booking_push_config').delete().eq('singleton',true);
}
