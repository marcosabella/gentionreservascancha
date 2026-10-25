import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReleaseManifest, MANIFEST_NAME, validateManifest, verifyReleaseDirectory } from './local-app/release-manifest.mjs';

const clients = {
  'padel-center': { project: 'zcixnnzxxkylotbjudhk', site: 'padelcenter', brand: 'PADEL CENTER' },
  'pura-vida': { project: 'qsvdpdifygmzdawxfyqv', site: 'multiespaciopuravida', brand: 'PURA VIDA' },
};
const [command, name] = process.argv.slice(2);
const client = clients[name];
if (!client || !['audit','migrate','build','deploy','verify'].includes(command)) throw Error('Expected audit|migrate|build|deploy|verify and padel-center|pura-vida.');
const releaseDir = resolve('supabase/releases');
const temporary = resolve('dev/release.local');
mkdirSync(releaseDir, { recursive: true }); mkdirSync(temporary, { recursive: true });
const runCli = args => execFileSync('supabase', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] });
function query(sql, suffix='query') {
  const file=join(temporary,`${name}-${suffix}.sql`); writeFileSync(file,sql);
  const output=runCli(['db','query','--linked','--project-ref',client.project,'--file',file,'--output','json']);
  const parsed=JSON.parse(output.slice(output.indexOf('{'),output.lastIndexOf('}')+1));
  return parsed.rows;
}
const save=(suffix,data)=>writeFileSync(join(releaseDir,`${name}-${suffix}.json`),JSON.stringify(data,null,2)+'\n');
const countsSql="json_build_object('players',(select count(*) from public.players),'bookings',(select count(*) from public.bookings),'sales',(select count(*) from public.sales),'accounts',(select count(*) from public.current_account_entries),'profiles',(select count(*) from public.user_profiles))";
function inspect() {
  const [row]=query(`SELECT ${countsSql} counts,
    to_regclass('supabase_migrations.schema_migrations') history,
    to_regclass('public.cash_sessions') cash,
    (SELECT count(*) FROM public.current_account_entries WHERE type='credit' AND (amount<=0 OR payment_method IS NULL)) invalid_credits,
    (SELECT count(*) FROM public.user_profiles p LEFT JOIN auth.users u ON p.id=u.id WHERE u.id IS NULL) unmatched_profiles,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='user_profiles' AND column_name IN ('password_hash','password_updated_at','last_login')) OR (table_name='players' AND column_name IN ('gender','category')) OR (table_name='booking_players' AND column_name='payment_splits'))) baseline_columns,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='sync_user_profile_last_login_on_auth_users') login_trigger,
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='court_unavailabilities_court_date_idx') availability_index,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('tournaments','court_unavailabilities') AND cmd IN ('ALL','SELECT') AND 'authenticated'=ANY(roles) AND qual='true' AND (with_check IS NULL OR with_check='true')) baseline_policies`,'audit');
  const history=row.history ? query('SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version','history') : [];
  return {project:client.project,site:client.site,...row,migrations:history,at:new Date().toISOString()};
}
if (command==='audit') { const state=inspect();save('before',state);console.log(JSON.stringify(state));process.exit(0); }
if (command==='migrate') {
  const state=inspect();
  if(state.invalid_credits || state.unmatched_profiles || state.baseline_columns!==6 || !state.login_trigger || !state.availability_index || state.baseline_policies!==4) throw Error('Existing schema/data needs review before migration.');
  const recorded=new Set(state.migrations.map(m=>m.version));
  const files=readdirSync('supabase/migrations').filter(file=>/^\d+_.+\.sql$/.test(file)).sort();
  if(new Set(files.map(file=>file.slice(0,14))).size!==files.length)throw Error('Duplicate local migration versions');
  for(const file of files) {
    const existing=state.migrations.find(item=>item.version===file.slice(0,14));
    if(existing && existing.name!==file.slice(15,-4))throw Error(`Migration version already belongs to another change: ${file}`);
  }
  const pending=files.filter(file=>file.slice(0,14)>='20261019120000' && !recorded.has(file.slice(0,14)));
  if(state.cash && pending.includes('20261019160000_cash_management.sql')) throw Error('Cash schema already exists without migration history; refusing to overwrite.');
  save('before',state);
  let sql=`BEGIN;\nSET LOCAL lock_timeout='15s';\nSELECT pg_advisory_xact_lock(19160000);\nCREATE SCHEMA IF NOT EXISTS supabase_migrations;\nCREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);\n`;
  for(const file of pending) {
    const source=readFileSync(join('supabase/migrations',file),'utf8');
    sql+='\n'+source.replace(/^\s*(BEGIN|COMMIT);[ \t]*\r?$/gm,'')+'\n';
  }
  const applied=[];
  for(const file of files) {
    const version=file.slice(0,14);if(recorded.has(version)) continue;
    const migrationName=file.slice(15,-4);
    // Older files already exist in the verified schema-only baseline. In
    // particular, do not recreate the obsolete single-active-tournament index.
    const source=readFileSync(join('supabase/migrations',file),'utf8');
    const tag='$release_'+createHash('sha256').update(source).digest('hex').slice(0,16)+'$';
    sql+=`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${migrationName}',ARRAY[${tag}${source}${tag}]) ON CONFLICT(version) DO NOTHING;\n`;
    applied.push({version,name:migrationName,mode:pending.includes(file)?'applied':'verified-existing-baseline'});
  }
  sql+="SELECT pg_notify('pgrst','reload schema');\nCOMMIT;\nSELECT 'committed' status;";
  if(applied.length)query(sql,'migrate');
  const after=inspect();save('migrations',{project:client.project,applied,beforeCounts:state.counts,afterCounts:after.counts,at:new Date().toISOString()});
  console.log(JSON.stringify({project:client.project,applied,beforeCounts:state.counts,afterCounts:after.counts}));process.exit(0);
}

function publicEnvironment() {
  const result=JSON.parse(runCli(['projects','api-keys','--project-ref',client.project,'--output','json']));
  const keys=Array.isArray(result)?result:result.api_keys;
  const anon=keys.find(key=>key.name==='anon')?.api_key;if(!anon)throw Error('Public API key unavailable');
  return {VITE_SUPABASE_URL:`https://${client.project}.supabase.co`,VITE_SUPABASE_ANON_KEY:anon,VITE_COMPLEX_NAME:client.brand,VITE_TEST_ENVIRONMENT:'false',VITE_SUPABASE_FUNCTIONS_URL:''};
}
const outputDir=resolve(`dist/${name}`);
function collect(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collect(join(directory,entry.name)):[join(directory,entry.name)]);}
function verifyBundle() {
  const bundle=collect(outputDir).filter(file=>file.endsWith('.js')).map(file=>readFileSync(file,'utf8')).join('\n');
  if(!bundle.includes(client.project) || Object.values(clients).some(other=>other.project!==client.project && bundle.includes(other.project)) || /127\.0\.0\.1:560|localhost:560/.test(bundle)) throw Error('Build has an incorrect database/function endpoint');
  if(!bundle.includes('cash_command') || !bundle.includes('current_account_enabled'))throw Error('Build is missing the latest features');
  if(!bundle.includes('booking_notification_feed') || !bundle.includes('player_create_booking'))throw Error('Build is missing player booking notifications');
  if(!bundle.includes('register_booking_push') || !bundle.includes('Activar avisos al dispositivo'))throw Error('Build is missing device push registration');
  if(!bundle.includes('Probar aviso en este dispositivo'))throw Error('Build is missing the device notification display test');
  if(!bundle.includes('update_booking_reminder_settings') || !bundle.includes('Anticipación del recordatorio'))throw Error('Build is missing configurable player reminders');
  if(!bundle.includes('send_player_announcement') || !bundle.includes('Buscar jugadores') || !bundle.includes('Agregar seleccionados') || !bundle.includes('Vaciar grilla') || !bundle.includes('player_ids') || !bundle.includes('notification-panel-reminders'))throw Error('Build is missing announcement selection, recipient grid or separate settings tabs');
  if(!bundle.includes('admin_player_announcement_history') || !bundle.includes('admin_player_announcement_deliveries') || !bundle.includes('Historial de notificaciones enviadas') || !bundle.includes('notification-panel-history'))throw Error('Build is missing the separate history tab and delivery status');
  const worker=readFileSync(join(outputDir,'sw.js'),'utf8');
  if(!worker.includes("addEventListener('push'") || !worker.includes("addEventListener('notificationclick'"))throw Error('Build is missing push worker handlers');
}
if(command==='build') {
  const publishedAt=new Date().toISOString(),version=`${Date.now()}-${randomUUID().slice(0,8)}`;
  execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',outputDir],{env:{...process.env,...publicEnvironment(),VITE_APP_VERSION:version},stdio:'inherit',windowsHide:true});
  writeFileSync(join(outputDir,'_redirects'),'/* /index.html 200\n');verifyBundle();
  writeFileSync(join(outputDir,'_headers'),'/sw.js\n  Cache-Control: no-store\n  Content-Type: text/javascript; charset=utf-8\n/manifest.json\n  Cache-Control: no-cache\n  Content-Type: application/manifest+json\n');
  if(name==='padel-center')await createReleaseManifest(outputDir,{version,publishedAt,notes:process.env.RELEASE_NOTES?.split('\n').filter(Boolean)});
  console.log(JSON.stringify({built:name,project:client.project,version}));process.exit(0);
}

const configuration=JSON.parse(readFileSync(join(process.env.APPDATA,'netlify/Config/config.json'),'utf8'));
const token=(configuration.users[configuration.userId]??Object.values(configuration.users)[0])?.auth?.token;
if(!token)throw Error('Netlify session unavailable');
async function api(path,{method='GET',body,contentType='application/json'}={}) {
  const response=await fetch(`https://api.netlify.com/api/v1${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':contentType},body:body===undefined?undefined:contentType==='application/json'?JSON.stringify(body):body});
  const result=await response.json().catch(()=>null);
  if(!response.ok) {
    const detail=typeof result?.message==='string'?result.message:typeof result?.error==='string'?result.error:'';
    throw Error(`Netlify ${method} ${path}: HTTP ${response.status}${detail?' · '+detail:''}`);
  }
  return result;
}
const sites=await api('/sites?per_page=100');const site=sites.find(site=>site.name===client.site);
if(!site)throw Error('Expected existing Netlify site not found');
if(command==='deploy') {
  verifyBundle();
  if(name==='padel-center')await verifyReleaseDirectory(outputDir,validateManifest(JSON.parse(readFileSync(join(outputDir,MANIFEST_NAME),'utf8'))));
  const environment=publicEnvironment();
  const envPath=`/accounts/${site.account_id}/env`;const current=await api(`${envPath}?site_id=${site.id}`);
  for(const [key,value] of Object.entries(environment)) {
    const definition={key,values:[{context:'all',value}]};
    await api(`${envPath}${current.some(item=>item.key===key)?'/'+key:''}?site_id=${site.id}`,{method:current.some(item=>item.key===key)?'PUT':'POST',body:current.some(item=>item.key===key)?definition:[definition]});
  }
  const files={},uploads=new Map();
  for(const file of collect(outputDir)){const data=readFileSync(file);const hash=createHash('sha1').update(data).digest('hex');const urlPath='/'+relative(outputDir,file).replaceAll('\\','/');files[urlPath]=hash;uploads.set(hash,{path:urlPath,data});}
  const deploy=await api(`/sites/${site.id}/deploys`,{method:'POST',body:{files,draft:false,title:`${client.brand} · Prueba de visualización de notificaciones en el dispositivo`}});
  for(const hash of deploy.required??[]){const file=uploads.get(hash);if(!file)throw Error('Unknown required file');await api(`/deploys/${deploy.id}/files${file.path}`,{method:'PUT',body:file.data,contentType:'application/octet-stream'});}
  let ready;
  for(let attempt=0;attempt<30;attempt++){ready=await api(`/deploys/${deploy.id}`);if(['ready','error'].includes(ready.state))break;await new Promise(resolve=>setTimeout(resolve,1500));}
  if(ready?.state!=='ready')throw Error(`Deployment did not become ready: ${ready?.state}`);
  const metadata={project:client.project,site:client.site,siteId:site.id,url:site.ssl_url??site.url,deployId:deploy.id,state:ready.state,at:new Date().toISOString(),workingTree:true};
  save('deployment',metadata);console.log(JSON.stringify(metadata));process.exit(0);
}
const url=site.ssl_url??site.url;
const response=await fetch(url+'/?release='+Date.now(),{cache:'no-store'});const html=await response.text();const assetPath=html.match(/src="([^"]+\.js)"/)?.[1];
if(!response.ok || !assetPath)throw Error('Published HTML unavailable');
const asset=await fetch(new URL(assetPath,url));const bundle=await asset.text();
if(!asset.ok || !bundle.includes(client.project) || Object.values(clients).some(other=>other.project!==client.project&&bundle.includes(other.project)) || !bundle.includes('cash_command') || !bundle.includes('current_account_enabled'))throw Error('Published site failed database/feature verification');
if(!bundle.includes('booking_notification_feed') || !bundle.includes('player_create_booking'))throw Error('Published site is missing player booking notifications');
if(!bundle.includes('register_booking_push') || !bundle.includes('Activar avisos al dispositivo'))throw Error('Published site is missing device push registration');
if(!bundle.includes('Probar aviso en este dispositivo'))throw Error('Published site is missing the device notification display test');
if(!bundle.includes('update_booking_reminder_settings') || !bundle.includes('Anticipación del recordatorio'))throw Error('Published site is missing configurable player reminders');
if(!bundle.includes('send_player_announcement') || !bundle.includes('Buscar jugadores') || !bundle.includes('Agregar seleccionados') || !bundle.includes('Vaciar grilla') || !bundle.includes('player_ids') || !bundle.includes('notification-panel-reminders'))throw Error('Published site is missing announcement selection, recipient grid or separate settings tabs');
if(!bundle.includes('admin_player_announcement_history') || !bundle.includes('admin_player_announcement_deliveries') || !bundle.includes('Historial de notificaciones enviadas') || !bundle.includes('notification-panel-history'))throw Error('Published site is missing the separate history tab and delivery status');
const expectedHtml=readFileSync(join(outputDir,'index.html'),'utf8');if(!expectedHtml.includes(assetPath))throw Error('Published asset does not match this build');
if(!html.includes('rel="manifest"') || !bundle.includes('Instalar app'))throw Error('Published player app installation is missing');
const appManifestResponse=await fetch(new URL('manifest.json?check='+Date.now(),url));
if(!appManifestResponse.ok)throw Error('Published web app manifest is unavailable');
const appManifest=await appManifestResponse.json();
const expectedAppManifest=JSON.parse(readFileSync(join(outputDir,'manifest.json'),'utf8'));
if(JSON.stringify(appManifest)!==JSON.stringify(expectedAppManifest))throw Error('Published web app manifest belongs to another build');
const workerResponse=await fetch(new URL('sw.js?check='+Date.now(),url));
if(!workerResponse.ok || await workerResponse.text()!==readFileSync(join(outputDir,'sw.js'),'utf8'))throw Error('Published install worker differs from this build');
let localUpdates=false;
if(name==='padel-center') {
  const remote=await fetch(new URL(MANIFEST_NAME+'?check='+Date.now(),url),{cache:'no-store'});
  if(!remote.ok)throw Error('Published local update manifest unavailable');
  const manifest=validateManifest(await remote.json()),expected=JSON.parse(readFileSync(join(outputDir,MANIFEST_NAME),'utf8'));
  if(JSON.stringify(manifest)!==JSON.stringify(expected))throw Error('Published local update differs from this release');
  localUpdates=true;
}
const checks={url,project:client.project,html:response.status,javascript:asset.status,correctDatabase:true,currentBuild:true,cash:true,playerCredit:true,bookingNotifications:true,bookingPush:true,playerAnnouncements:true,announcementPlayerSelection:true,announcementHistory:true,separateNotificationTabs:true,playerAppInstall:true,localUpdates,at:new Date().toISOString()};save('site-verification',checks);console.log(JSON.stringify(checks));
