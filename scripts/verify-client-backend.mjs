import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const name=process.argv[2];
const project={ 'padel-center':'zcixnnzxxkylotbjudhk','pura-vida':'qsvdpdifygmzdawxfyqv' }[name];
assert(project,'Specify padel-center or pura-vida');
const cli=args=>execFileSync('supabase',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
function query(sql,label) {
  const file=`dev/release.local/${name}-verify-${label}.sql`;writeFileSync(file,sql);
  const text=cli(['db','query','--linked','--project-ref',project,'--file',file,'--output','json']);
  return JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)).rows;
}
const rows=query(`SELECT version,md5(statements[1]) digest FROM supabase_migrations.schema_migrations ORDER BY version`,'history');
const files=readdirSync('supabase/migrations').filter(file=>/^\d+_.*\.sql$/.test(file));
for(const file of files) {
  const row=rows.find(row=>row.version===file.slice(0,14));assert(row,`Missing migration ${file}`);
  if(file.slice(0,14)>='20261019120000')assert.equal(row.digest,createHash('md5').update(readFileSync(join('supabase/migrations',file),'utf8')).digest('hex'),`Migration content mismatch: ${file}`);
}
const [security]=query(`SELECT
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anonymous_grants,
  has_column_privilege('authenticated','public.user_profiles','password_hash','SELECT') hash_exposed,
  has_column_privilege('authenticated','public.user_profiles','role','UPDATE') role_editable,
  has_column_privilege('authenticated','public.user_profiles','permissions','UPDATE') permissions_editable,
  (SELECT count(*) FROM public.players WHERE current_account_enabled) enabled_players,
  (SELECT count(*) FROM public.cash_sessions) cash_sessions,
  (SELECT count(*) FROM public.cash_movements) cash_movements,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')) exposed_definers,
  (SELECT count(*) FROM public.user_profiles WHERE role='player' AND is_active) active_players`,'security');
assert.equal(security.anonymous_grants,0);assert.equal(security.hash_exposed,false);assert.equal(security.role_editable,false);assert.equal(security.permissions_editable,false);assert.equal(security.exposed_definers,0);
function verifyRole(role) {
  const result=query(`BEGIN;
    SELECT set_config('request.jwt.claims',(SELECT json_build_object('sub',id,'role','authenticated')::text FROM public.user_profiles WHERE role='${role}' AND is_active ORDER BY id LIMIT 1),true);
    SET LOCAL ROLE authenticated;
    SELECT '${role}' check_role,(SELECT count(*) FROM public.players) player_rows,
      (SELECT count(*) FROM public.courts) court_rows,(SELECT count(*) FROM public.bookings) booking_rows,
      (SELECT count(*) FROM public.cash_sessions) cash_rows,public.cash_allowed('cash.open') may_open_cash;
    ROLLBACK;`,'role-'+role).find(row=>row.check_role===role);
  assert(result,`Role ${role} did not execute`);assert.equal(result.may_open_cash,role==='admin');return result;
}
const admin=verifyRole('admin');const player=security.active_players?verifyRole('player'):null;
const keyResult=JSON.parse(cli(['projects','api-keys','--project-ref',project,'--output','json']));
const keys=Array.isArray(keyResult)?keyResult:keyResult.api_keys;const anon=keys.find(key=>key.name==='anon')?.api_key;assert(anon);
const base=`https://${project}.supabase.co`;
const administrativeFunctions=['get-all-users','create-user','update-user-role','toggle-user-status','delete-user','reset-user-password',...(name==='padel-center'?['reset-admin-password']:[])];
for(const fn of administrativeFunctions) {
  const response=await fetch(`${base}/functions/v1/${fn}`,{method:fn==='get-all-users'?'GET':'POST',headers:{apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'},body:fn==='get-all-users'?undefined:'{}'});
  assert([401,403].includes(response.status),`Anonymous administrative function ${fn}: ${response.status}`);
}
const anonymous=await fetch(`${base}/rest/v1/players?select=id&limit=1`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}});
assert([401,403].includes(anonymous.status));
const invalid=await fetch(`${base}/functions/v1/login`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'},body:JSON.stringify({username:'__release_invalid_'+Date.now(),password:'invalid-release-check'})});
assert.equal(invalid.status,401,'Unknown-user login must fail without a session');
const checks={project,migrationsVerified:files.length,newMigrationContentsMatch:true,security,admin,player,anonymousDataBlocked:true,administrativeFunctionsProtected:administrativeFunctions.length,invalidLoginRejected:true,at:new Date().toISOString()};
writeFileSync(`supabase/releases/${name}-backend-verification.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
