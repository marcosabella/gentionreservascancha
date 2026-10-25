import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projects = { 'padel-center':'zcixnnzxxkylotbjudhk', 'pura-vida':'qsvdpdifygmzdawxfyqv' };
const name = process.argv[2], project = projects[name];
assert(project, 'Expected padel-center|pura-vida');
const cli = args => {
  try { return JSON.parse(execFileSync('supabase',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})); }
  catch { throw Error(`Supabase verification failed (${args[0]} ${args[1]}); no credentials printed.`); }
};
const file = resolve(`dev/release.local/${name}-announcements-verify.sql`);
writeFileSync(file, `SELECT
  (SELECT md5(statements[1]) FROM supabase_migrations.schema_migrations WHERE version='20261023180000' AND name='player_announcements') migration_digest,
  (SELECT md5(statements[1]) FROM supabase_migrations.schema_migrations WHERE version='20261023190000' AND name='player_announcement_selection') selection_digest,
  (SELECT md5(statements[1]) FROM supabase_migrations.schema_migrations WHERE version='20261023200000' AND name='player_announcement_history') history_digest,
  (SELECT position('player_ids' IN prosrc)>0 FROM pg_proc WHERE oid='public.send_player_announcement(uuid,text,text,jsonb)'::regprocedure) multiple_players,
  (SELECT count(*) FROM pg_class WHERE oid IN ('public.player_announcements'::regclass,'public.player_announcement_recipients'::regclass,'public.player_announcement_push_history'::regclass) AND relrowsecurity) protected_tables,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('player_announcements','player_announcement_recipients','player_announcement_push_history') AND grantee IN ('anon','authenticated')) exposed_tables,
  (SELECT count(*) FROM pg_proc WHERE oid IN ('public.player_announcement_audience()'::regprocedure,'public.send_player_announcement(uuid,text,text,jsonb)'::regprocedure,'public.player_announcement_feed(timestamptz,uuid)'::regprocedure,'public.read_player_announcement(uuid)'::regprocedure,'public.admin_player_announcement_history(timestamptz,uuid)'::regprocedure,'public.admin_player_announcement_deliveries(uuid,uuid)'::regprocedure) AND prosecdef AND proconfig @> ARRAY['search_path=""'] AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')) secured_rpcs,
  (SELECT count(*) FROM pg_trigger WHERE tgname='capture_announcement_push_history' AND tgrelid='public.booking_push_deliveries'::regclass AND tgenabled='O') history_trigger,
  (SELECT count(*) FROM pg_proc WHERE oid IN ('public.claim_booking_push()'::regprocedure,'public.booking_push_delivery_allowed(uuid)'::regprocedure,'public.wake_booking_push()'::regprocedure) AND position('announcement' IN prosrc)>0 AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) updated_workers,
  (SELECT count(*) FROM public.player_announcements) announcements,
  (SELECT count(*) FROM public.player_announcement_recipients) recipients;`);
const {rows:[state]} = cli(['db','query','--linked','--project-ref',project,'--file',file,'--output','json']);
assert.equal(state.migration_digest,createHash('md5').update(readFileSync('supabase/migrations/20261023180000_player_announcements.sql')).digest('hex'));
assert.equal(state.selection_digest,createHash('md5').update(readFileSync('supabase/migrations/20261023190000_player_announcement_selection.sql')).digest('hex'));
assert.equal(state.history_digest,createHash('md5').update(readFileSync('supabase/migrations/20261023200000_player_announcement_history.sql')).digest('hex'));
assert.equal(state.multiple_players,true);
assert.equal(state.protected_tables,3); assert.equal(state.exposed_tables,0); assert.equal(state.secured_rpcs,6); assert.equal(state.updated_workers,3); assert.equal(state.history_trigger,1);
const functions = cli(['functions','list','--project-ref',project,'--output','json']);
const worker = functions.find(item => item.slug==='dispatch-booking-push' || item.name==='dispatch-booking-push');
assert.equal(worker?.status,'ACTIVE'); assert.equal(worker.verify_jwt,false);
for (const headers of [{},{'x-push-dispatch-token':'unauthorized-verification'}]) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/dispatch-booking-push`,{method:'POST',headers});
  assert.equal(response.status,401,'Public calls must not send notifications');
}
const result = {project,...state,worker:{name:worker.slug ?? worker.name,status:worker.status,version:worker.version,updated_at:worker.updated_at},publicWorkerDenied:true,verificationScope:'backend',at:new Date().toISOString()};
writeFileSync(`supabase/releases/${name}-announcements-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
