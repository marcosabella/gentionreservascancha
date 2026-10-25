import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

const targets = {
  'padel-center': { project: 'zcixnnzxxkylotbjudhk', url: 'https://padelcenter.netlify.app/' },
  'pura-vida': { project: 'qsvdpdifygmzdawxfyqv', url: 'https://multiespaciopuravida.netlify.app/' },
};
const [command, name] = process.argv.slice(2), target = targets[name];
assert(target && ['configure', 'verify', 'enable-reminders'].includes(command), 'Expected configure|verify|enable-reminders padel-center|pura-vida');
const temporary = resolve('dev/release.local'); mkdirSync(temporary, { recursive: true });
// All private material stays in an ignored local backup and Supabase secrets.
const secretFile = join(temporary, `${name}-booking-push.env`);
function cli(args) {
  try { return execFileSync('supabase', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Error(`Supabase operation failed (${args[0]} ${args[1]}). No credentials were printed.`); }
}
function query(sql) {
  const file = join(temporary, `${name}-push-configure.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    const output = cli(['db', 'query', '--linked', '--project-ref', target.project, '--file', file, '--output', 'json']);
    return JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)).rows;
  } finally { unlinkSync(file); }
}
if (command === 'enable-reminders') {
  query('UPDATE public.booking_push_config SET reminders_enabled = true WHERE singleton; SELECT true AS enabled;');
  console.log(JSON.stringify({ project: target.project, playerRemindersEnabled: true }));
  process.exit(0);
}
if (command === 'configure') {
  const [state] = query("SELECT to_regclass('public.booking_push_config') IS NOT NULL AS installed");
  assert(state.installed, 'Apply the push migration first');
  const current = query('SELECT public_key FROM public.booking_push_config');
  let secrets;
  if (existsSync(secretFile)) {
    secrets = Object.fromEntries(readFileSync(secretFile, 'utf8').trim().split(/\r?\n/).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  } else {
    assert(!current.length, 'Existing VAPID configuration has no local key backup; refusing to rotate subscribed devices');
    const key = createECDH('prime256v1'); key.generateKeys();
    secrets = {
      BOOKING_PUSH_PUBLIC_KEY: key.getPublicKey().toString('base64url'),
      BOOKING_PUSH_PRIVATE_KEY: Buffer.concat([Buffer.alloc(32 - key.getPrivateKey().length), key.getPrivateKey()]).toString('base64url'),
      BOOKING_PUSH_DISPATCH_TOKEN: randomBytes(32).toString('base64url'),
      BOOKING_PUSH_APP_URL: target.url,
    };
    writeFileSync(secretFile, Object.entries(secrets).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  }
  assert.equal(secrets.BOOKING_PUSH_APP_URL, target.url);
  assert(/^[A-Za-z0-9_-]{87}$/.test(secrets.BOOKING_PUSH_PUBLIC_KEY));
  assert(/^[A-Za-z0-9_-]{43}$/.test(secrets.BOOKING_PUSH_PRIVATE_KEY));
  assert(/^[A-Za-z0-9_-]{43}$/.test(secrets.BOOKING_PUSH_DISPATCH_TOKEN));
  if (current.length) assert.equal(current[0].public_key, secrets.BOOKING_PUSH_PUBLIC_KEY, 'VAPID key mismatch');
  cli(['secrets', 'set', '--project-ref', target.project, '--env-file', secretFile]);
  cli(['functions', 'deploy', 'dispatch-booking-push', '--project-ref', target.project, '--no-verify-jwt', '--use-api']);
  const pairs = {
    booking_push_dispatch_token: secrets.BOOKING_PUSH_DISPATCH_TOKEN,
    booking_push_dispatch_url: `https://${target.project}.supabase.co/functions/v1/dispatch-booking-push`,
  };
  const escape = value => `'${value.replaceAll("'", "''")}'`;
  const vaultStatements = Object.entries(pairs).map(([key, value]) => `
    SELECT id INTO existing FROM vault.secrets WHERE name = ${escape(key)};
    IF existing IS NULL THEN PERFORM vault.create_secret(${escape(value)}, ${escape(key)});
    ELSE PERFORM vault.update_secret(existing, ${escape(value)}, ${escape(key)}); END IF;`).join('\n');
  query(`BEGIN;
    DO $configure$ DECLARE existing uuid; BEGIN ${vaultStatements} END $configure$;
    INSERT INTO public.booking_push_config(singleton, public_key, app_url, enabled)
    VALUES (true, ${escape(secrets.BOOKING_PUSH_PUBLIC_KEY)}, ${escape(target.url)}, true)
    ON CONFLICT(singleton) DO UPDATE SET public_key = excluded.public_key, app_url = excluded.app_url, enabled = true;
    COMMIT; SELECT true AS configured;`);
  console.log(JSON.stringify({ configured: name, project: target.project, workerDeployed: true, privateKeys: 'Supabase secrets; ignored local backup', enabled: true }));
  process.exit(0);
}

const [state] = query(`SELECT
  (SELECT count(*) FROM public.booking_push_config WHERE enabled AND app_url = '${target.url}') configured,
  (SELECT count(*) FROM pg_class WHERE oid IN ('public.booking_push_config'::regclass, 'public.booking_push_subscriptions'::regclass, 'public.booking_push_deliveries'::regclass) AND relrowsecurity) protected_tables,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name LIKE 'booking_push_%' AND grantee IN ('anon','authenticated')) exposed_tables,
  (SELECT count(*) FROM pg_proc WHERE oid IN ('public.claim_booking_push()'::regprocedure, 'public.finish_booking_push(uuid,uuid,integer)'::regprocedure, 'public.wake_booking_push()'::regprocedure) AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))) exposed_workers,
  (SELECT count(*) FROM cron.job WHERE jobname = 'booking-push-retry' AND active) retry_job,
  (SELECT count(*) FROM vault.secrets WHERE name IN ('booking_push_dispatch_token','booking_push_dispatch_url')) dispatcher_secrets,
  (SELECT count(*) FROM public.booking_push_subscriptions) devices,
  (SELECT count(*) FROM public.booking_push_deliveries WHERE state IN ('queued','sending')) pending`);
assert.equal(state.configured, 1); assert.equal(state.protected_tables, 3); assert.equal(state.exposed_tables, 0);
assert.equal(state.exposed_workers, 0); assert.equal(state.retry_job, 1); assert.equal(state.dispatcher_secrets, 2);
const [reminders] = query(`SELECT
  (SELECT reminder_minutes FROM public.booking_push_config) minutes,
  (SELECT reminders_enabled FROM public.booking_push_config) enabled,
  (SELECT count(*) FROM cron.job WHERE jobname = 'booking-push-retry' AND command LIKE '%queue_booking_reminders%' AND active) scheduler,
  (SELECT count(*) FROM pg_proc WHERE oid IN ('public.queue_booking_reminders()'::regprocedure, 'public.booking_push_delivery_allowed(uuid)'::regprocedure, 'public.booking_push_job_current(uuid,uuid)'::regprocedure) AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))) exposed_workers,
  has_function_privilege('authenticated','public.update_booking_reminder_settings(integer,boolean)','EXECUTE') settings_rpc`);
assert(reminders.minutes >= 5 && reminders.minutes <= 1440);
assert.equal(reminders.scheduler, 1); assert.equal(reminders.exposed_workers, 0); assert.equal(reminders.settings_rpc, true);
const workerUrl = `https://${target.project}.supabase.co/functions/v1/dispatch-booking-push`;
for (const headers of [{}, { 'x-push-dispatch-token': 'unauthorized-test' }]) {
  const response = await fetch(workerUrl, { method: 'POST', headers });
  assert.equal(response.status, 401, 'Public callers must not invoke the worker');
}
// Exercise the real deployed worker only if there are no actual messages pending.
let authenticatedWorker = 'not invoked: pending delivery';
if (!state.pending && existsSync(secretFile)) {
  const content = readFileSync(secretFile, 'utf8');
  const token = content.match(/^BOOKING_PUSH_DISPATCH_TOKEN=(.+)$/m)?.[1]; assert(token);
  const response = await fetch(workerUrl, { method: 'POST', headers: { 'x-push-dispatch-token': token } });
  assert.equal(response.status, 200, 'Configured worker must start and query its queue');
  const body = await response.json(); assert.equal(body.claimed, 0); authenticatedWorker = 'passed: empty queue';
}
const source = readFileSync('supabase/migrations/20261023150000_booking_web_push.sql', 'utf8');
const [history] = query("SELECT md5(statements[1]) AS digest FROM supabase_migrations.schema_migrations WHERE version='20261023150000'");
assert.equal(history.digest, createHash('md5').update(source).digest('hex'));
const reminderSource = readFileSync('supabase/migrations/20261023170000_player_booking_reminders.sql', 'utf8');
const [reminderHistory] = query("SELECT md5(statements[1]) AS digest FROM supabase_migrations.schema_migrations WHERE version='20261023170000'");
assert.equal(reminderHistory.digest, createHash('md5').update(reminderSource).digest('hex'));
const result = { project: target.project, site: target.url, ...state, reminders, publicWorkerDenied: true, authenticatedWorker, migrationMatches: true, at: new Date().toISOString() };
writeFileSync(`supabase/releases/${name}-push-verification.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
