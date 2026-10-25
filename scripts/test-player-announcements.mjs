import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(execFileSync('supabase', ['status','--workdir','dev/pura-vida.local','--output','json'], { encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'] }));
assert.equal(config.API_URL,'http://127.0.0.1:56000','Only use the isolated local database');
const sql = input => {
  try { return execFileSync('docker',['exec','-i','supabase_db_pura-vida-dev','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-tA'], { input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'] }); }
  catch (error) { throw new Error(error.stderr?.toString() || error.message); }
};
const migration = readFileSync('supabase/migrations/20261023180000_player_announcements.sql','utf8');
if (sql("SELECT to_regclass('public.player_announcements') IS NULL").trim() === 't') sql(migration);
else for (const match of migration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.[\s\S]*?\$\$;/g)) sql(match[0].replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION'));
sql(readFileSync('supabase/migrations/20261023190000_player_announcement_selection.sql','utf8'));
const historyMigration = readFileSync('supabase/migrations/20261023200000_player_announcement_history.sql','utf8');
if (sql("SELECT to_regclass('public.player_announcement_push_history') IS NULL").trim() === 't') sql(historyMigration);
else for (const match of historyMigration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.[\s\S]*?\$\$;/g)) sql(match[0].replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION'));
const options = { auth:{persistSession:false,autoRefreshToken:false} };
const service = createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const users = [], players = [], clients = [];
async function ok(query) { const {data,error} = await query; assert.ifError(error && new Error(error.message)); return data; }
async function account(role, playerId = null, active = true) {
  const username = `announcement_${randomUUID().slice(0,8)}`, password = `${randomUUID()}aA1!`;
  const {user} = await ok(service.auth.admin.createUser({email:`${username}@example.invalid`,password,email_confirm:true})); users.push(user.id);
  await ok(service.from('user_profiles').insert({id:user.id,username,role,player_id:playerId,is_active:active,password_hash:'test-unused'}));
  const client = createClient(config.API_URL,config.ANON_KEY,options); clients.push(client);
  const {session} = await ok(client.auth.signInWithPassword({email:user.email,password}));
  return {id:user.id,session:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id,client};
}
const claims = actor => `SELECT set_config('request.jwt.claims','${JSON.stringify({sub:actor.id,role:'authenticated',session_id:actor.session})}',true);`;
const ids = Array.from({length:7},()=>randomUUID());
try {
  for (const [category,gender] of [[2,'femenino'],[2,'masculino'],[3,'femenino'],[null,null]]) {
    players.push((await ok(service.from('players').insert({name:`Prueba avisos ${randomUUID()}`,email:'test@example.invalid',phone:'000',category,gender}).select('id').single())).id);
  }
  const admin = await account('admin'), recipients = [];
  for (const id of players) recipients.push(await account('player',id));
  const employee = await account('employee'), unlinked = await account('player'), inactive = await account('player',players[0],false);
  for (const actor of [recipients[0],employee,unlinked,inactive]) {
    assert((await actor.client.rpc('send_player_announcement',{request_id:randomUUID(),heading:'No permitido',message:'Prueba',filters:{}})).error);
    assert((await actor.client.rpc('player_announcement_audience')).error);
    assert((await actor.client.from('player_announcements').select('*')).error);
    assert((await actor.client.from('player_announcement_recipients').select('*')).error);
    assert((await actor.client.from('player_announcement_push_history').select('*')).error);
    assert((await actor.client.rpc('admin_player_announcement_history')).error);
    assert((await actor.client.rpc('admin_player_announcement_deliveries',{target:randomUUID()})).error);
  }
  sql(`BEGIN;
    INSERT INTO public.booking_push_config(singleton,enabled,public_key,app_url) VALUES(true,true,'${'A'.repeat(87)}','https://example.invalid')
      ON CONFLICT(singleton) DO UPDATE SET enabled=true;
    INSERT INTO public.booking_push_subscriptions(user_id,session_id,endpoint,p256dh,auth) VALUES
      ('${recipients[0].id}','${recipients[0].session}','https://fcm.googleapis.com/test-${randomUUID()}','${'A'.repeat(87)}','${'A'.repeat(22)}'),
      ('${recipients[1].id}','${recipients[1].session}','https://fcm.googleapis.com/test-${randomUUID()}','${'A'.repeat(87)}','${'A'.repeat(22)}');
    ${claims(admin)}
    SET LOCAL ROLE authenticated;
    DO $test$ DECLARE r jsonb; bad jsonb; BEGIN
      r := public.send_player_announcement('${ids[0]}','Torneo','Mensaje general','{}');
      IF (r->>'players')::integer < 4 THEN RAISE EXCEPTION 'All players missing'; END IF;
      r := public.send_player_announcement('${ids[1]}','Categoría','Mensaje categoría','{"category":2}');
      r := public.send_player_announcement('${ids[2]}','Género','Mensaje género','{"gender":"femenino"}');
      r := public.send_player_announcement('${ids[3]}','Combinado','Mensaje combinado','{"category":2,"gender":"femenino"}');
      r := public.send_player_announcement('${ids[4]}','Individual','Mensaje individual','{"player_id":"${players[2]}"}');
      IF r <> '{"players":1,"devices":0}'::jsonb THEN RAISE EXCEPTION 'Player without push lost'; END IF;
      IF public.send_player_announcement('${ids[4]}','Individual','Mensaje individual','{"player_id":"${players[2]}"}') <> r THEN RAISE EXCEPTION 'Retry changed result'; END IF;
      r := public.send_player_announcement('${ids[6]}','Grilla','Selección múltiple','{"player_ids":["${players[0]}","${players[2]}","${players[0]}"]}');
      IF r <> '{"players":2,"devices":1}'::jsonb THEN RAISE EXCEPTION 'Grid recipients duplicated or missing'; END IF;
      IF public.send_player_announcement('${ids[6]}','Grilla','Selección múltiple','{"player_ids":["${players[0]}","${players[2]}","${players[0]}"]}') <> r THEN RAISE EXCEPTION 'Grid retry changed result'; END IF;
      FOR bad IN SELECT value FROM jsonb_array_elements('[{"player_ids":[]},{"player_ids":null},{"player_ids":"all"},{"player_ids":[null]},{"player_ids":[4]},{"player_ids":["invalid"]}]'::jsonb) LOOP
        BEGIN
          PERFORM public.send_player_announcement('${ids[5]}','Invalid grid','Test',bad);
          RAISE EXCEPTION 'Invalid grid accepted';
        EXCEPTION WHEN raise_exception OR invalid_text_representation THEN IF SQLERRM='Invalid grid accepted' THEN RAISE; END IF; END;
      END LOOP;
      BEGIN
        PERFORM public.send_player_announcement('${ids[4]}','Individual','Changed','{"player_id":"${players[2]}"}');
        RAISE EXCEPTION 'Reused request accepted';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM='Reused request accepted' THEN RAISE; END IF; END;
      BEGIN
        PERFORM public.send_player_announcement('${ids[5]}','Invalid','Test','{"category":9}');
        RAISE EXCEPTION 'Invalid category accepted';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM='Invalid category accepted' THEN RAISE; END IF; END;
      BEGIN
        PERFORM public.send_player_announcement('${ids[5]}','Empty','Test','{"category":8,"player_id":"${players[0]}"}');
        RAISE EXCEPTION 'Empty audience accepted';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM='Empty audience accepted' THEN RAISE; END IF; END;
    END $test$;
    RESET ROLE;
    DO $test$ BEGIN
      IF (SELECT count(*) FROM public.player_announcement_recipients WHERE announcement_id='${ids[4]}') <> 1 THEN RAISE EXCEPTION 'Duplicate or unrelated recipient'; END IF;
      IF (SELECT count(*) FROM public.player_announcement_recipients WHERE announcement_id='${ids[6]}') <> 2 OR EXISTS(SELECT 1 FROM public.player_announcement_recipients WHERE announcement_id='${ids[6]}' AND player_id NOT IN ('${players[0]}','${players[2]}')) THEN RAISE EXCEPTION 'Grid included unrelated players'; END IF;
      IF EXISTS(SELECT 1 FROM public.player_announcement_recipients WHERE user_id='${inactive.id}') THEN RAISE EXCEPTION 'Inactive recipient included'; END IF;
      IF (SELECT array_agg(player_id ORDER BY player_id) FROM public.player_announcement_recipients WHERE announcement_id='${ids[1]}' AND player_id=ANY(ARRAY[${players.map(p=>`'${p}'::uuid`).join(',')}])) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['${players[0]}'::uuid,'${players[1]}'::uuid]) x) THEN RAISE EXCEPTION 'Category filter mismatch'; END IF;
      IF (SELECT count(*) FROM public.player_announcement_recipients WHERE announcement_id='${ids[2]}' AND player_id=ANY(ARRAY[${players.map(p=>`'${p}'::uuid`).join(',')}])) <> 2 THEN RAISE EXCEPTION 'Gender filter mismatch'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.player_announcement_recipients WHERE announcement_id='${ids[3]}' AND player_id='${players[0]}')
        OR EXISTS(SELECT 1 FROM public.player_announcement_recipients WHERE announcement_id='${ids[3]}' AND player_id IN ('${players[1]}','${players[2]}','${players[3]}')) THEN RAISE EXCEPTION 'Combined filter mismatch'; END IF;
      IF (SELECT count(*) FROM public.booking_push_deliveries WHERE announcement_id='${ids[3]}' AND subscription_id IN (SELECT id FROM public.booking_push_subscriptions WHERE user_id='${recipients[1].id}')) <> 0 THEN RAISE EXCEPTION 'Push sent outside filter'; END IF;
    END $test$;
    ${claims(admin)}
    DO $test$ DECLARE j uuid; token uuid := gen_random_uuid(); row_data jsonb; list jsonb; BEGIN
      SELECT x INTO row_data FROM jsonb_array_elements(public.admin_player_announcement_history()) x WHERE x->>'id'='${ids[0]}';
      IF (row_data->>'queued')::integer <> 2 OR (row_data->>'sent')::integer <> 0 THEN RAISE EXCEPTION 'Queued history incorrect'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(public.admin_player_announcement_deliveries('${ids[0]}'))) <> 2 THEN RAISE EXCEPTION 'Device detail missing'; END IF;
      SELECT d.id INTO j FROM public.booking_push_deliveries d JOIN public.booking_push_subscriptions s ON s.id=d.subscription_id WHERE d.announcement_id='${ids[0]}' AND s.user_id='${recipients[0].id}';
      UPDATE public.booking_push_deliveries SET state='sending',attempts=1,lease=token WHERE id=j;
      IF (SELECT state FROM public.player_announcement_push_history WHERE id=j)<>'sending' THEN RAISE EXCEPTION 'Processing history missing'; END IF;
      PERFORM public.finish_booking_push(j,token,503);
      IF NOT EXISTS(SELECT 1 FROM public.player_announcement_push_history WHERE id=j AND state='queued' AND last_status=503 AND attempts=1 AND next_attempt_at>now()) THEN RAISE EXCEPTION 'Retry history incorrect'; END IF;
      UPDATE public.booking_push_deliveries SET state='sending',attempts=2,lease=token WHERE id=j;
      PERFORM public.finish_booking_push(j,token,201);
      DELETE FROM public.booking_push_deliveries WHERE id=j;
      IF NOT EXISTS(SELECT 1 FROM public.player_announcement_push_history WHERE id=j AND state='sent' AND last_status=201 AND attempts=2) THEN RAISE EXCEPTION 'Successful history lost on queue cleanup'; END IF;
      SELECT d.id INTO j FROM public.booking_push_deliveries d JOIN public.booking_push_subscriptions s ON s.id=d.subscription_id WHERE d.announcement_id='${ids[0]}' AND s.user_id='${recipients[1].id}';
      UPDATE public.booking_push_deliveries SET state='sending',attempts=1,lease=token WHERE id=j;
      PERFORM public.finish_booking_push(j,token,410);
      IF NOT EXISTS(SELECT 1 FROM public.player_announcement_push_history WHERE id=j AND state='failed' AND last_status=410) THEN RAISE EXCEPTION 'Expired endpoint outcome lost'; END IF;
      SELECT x INTO row_data FROM jsonb_array_elements(public.admin_player_announcement_history()) x WHERE x->>'id'='${ids[0]}';
      IF (row_data->>'sent')::integer <> 1 OR (row_data->>'failed')::integer <> 1 OR (row_data->>'untracked')::integer <> 0 THEN RAISE EXCEPTION 'Partial outcome incorrect'; END IF;
      SELECT x INTO row_data FROM jsonb_array_elements(public.admin_player_announcement_history()) x WHERE x->>'id'='${ids[4]}';
      IF (row_data->>'devices')::integer <> 0 THEN RAISE EXCEPTION 'Inbox-only history incorrect'; END IF;
      UPDATE public.player_announcements SET result=jsonb_set(result,'{devices}','1') WHERE id='${ids[4]}';
      SELECT x INTO row_data FROM jsonb_array_elements(public.admin_player_announcement_history()) x WHERE x->>'id'='${ids[4]}';
      IF (row_data->>'untracked')::integer <> 1 OR (row_data->>'sent')::integer <> 0 THEN RAISE EXCEPTION 'Old missing logs presented as successful'; END IF;
      UPDATE public.player_announcements SET result=jsonb_set(result,'{devices}','0') WHERE id='${ids[4]}';
    END $test$;
    ${claims(recipients[2])}
    SET LOCAL ROLE authenticated;
    DO $test$ DECLARE feed jsonb; BEGIN
      feed := public.player_announcement_feed();
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(feed->'items') x WHERE x->>'id'='${ids[4]}') THEN RAISE EXCEPTION 'Inbox message missing'; END IF;
      PERFORM public.read_player_announcement('${ids[4]}');
      feed := public.player_announcement_feed();
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(feed->'items') x WHERE x->>'id'='${ids[4]}' AND x->>'read_at' IS NULL) THEN RAISE EXCEPTION 'Read not saved'; END IF;
      BEGIN
        PERFORM public.read_player_announcement('${ids[3]}'); RAISE EXCEPTION 'Read other player message';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END $test$;
    RESET ROLE;
    ${claims(admin)}
    DO $test$ DECLARE summary jsonb; BEGIN
      SELECT x INTO summary FROM jsonb_array_elements(public.admin_player_announcement_history()) x WHERE x->>'id'='${ids[4]}';
      IF (summary->>'read_players')::integer <> 1 THEN RAISE EXCEPTION 'Read count missing from history'; END IF;
    END $test$;
    DO $test$ DECLARE j jsonb; BEGIN
      SELECT x INTO j FROM jsonb_array_elements(public.claim_booking_push()) x WHERE x->>'announcementId'='${ids[3]}';
      IF j IS NULL OR j->>'kind'<>'announcement' OR j->>'title'<>'Combinado' OR j->>'body'<>'Mensaje combinado' THEN RAISE EXCEPTION 'Push payload mismatch'; END IF;
      IF NOT public.booking_push_job_current((j->>'id')::uuid,(j->>'lease')::uuid) THEN RAISE EXCEPTION 'Valid push blocked'; END IF;
      UPDATE public.user_profiles SET player_id='${players[3]}' WHERE id='${recipients[0].id}';
      IF public.booking_push_job_current((j->>'id')::uuid,(j->>'lease')::uuid) THEN RAISE EXCEPTION 'Relinked account can receive old message'; END IF;
    END $test$;
    ${claims(recipients[0])}
    SET LOCAL ROLE authenticated;
    DO $test$ BEGIN
      IF jsonb_array_length(public.player_announcement_feed()->'items') <> 0 THEN RAISE EXCEPTION 'Relinked account sees old inbox'; END IF;
    END $test$;
    RESET ROLE;
    ${claims(admin)}
    DO $test$ DECLARE first_page jsonb; next_page jsonb; last_item jsonb; BEGIN
      INSERT INTO public.player_announcement_push_history(id,announcement_id,player_name,state,attempts,created_at)
        SELECT gen_random_uuid(),'${ids[4]}','Dispositivo de prueba','sent',1,now() FROM generate_series(1,35);
      first_page := public.admin_player_announcement_deliveries('${ids[4]}');
      IF jsonb_array_length(first_page)<>31 THEN RAISE EXCEPTION 'Device pagination limit incorrect'; END IF;
      next_page := public.admin_player_announcement_deliveries('${ids[4]}',(first_page->29->>'id')::uuid);
      IF jsonb_array_length(next_page)<>5 OR next_page->0->>'id'<>first_page->30->>'id' THEN RAISE EXCEPTION 'Device pagination skipped or repeated entries'; END IF;
      INSERT INTO public.player_announcements(id,title,body,filters,result,created_at)
        SELECT gen_random_uuid(),'Página de prueba','Mensaje','{}','{"players":0,"devices":0}',now()-interval '1 year' FROM generate_series(1,23);
      first_page := public.admin_player_announcement_history();
      IF jsonb_array_length(first_page)<>21 THEN RAISE EXCEPTION 'History pagination limit incorrect'; END IF;
      last_item := first_page->19;
      next_page := public.admin_player_announcement_history((last_item->>'created_at')::timestamptz,(last_item->>'id')::uuid);
      IF next_page->0->>'id'<>first_page->20->>'id' THEN RAISE EXCEPTION 'History pagination skipped an entry'; END IF;
    END $test$;
    ROLLBACK;`);
  console.log('PASS: admin-only sends/history, RLS, audience filters and recipient grid, inbox/read isolation, idempotent retries, queued/processing/retry/sent/failed history, partial outcomes, history survives cleanup and expired endpoints, missing legacy logs remain unknown, read counts, push payload and account relinking.');
} finally {
  for (const client of clients) await client.auth.signOut();
  for (const id of users) await service.auth.admin.deleteUser(id);
  for (const id of players) await service.from('players').delete().eq('id',id);
}
