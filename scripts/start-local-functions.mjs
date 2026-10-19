import { execFileSync, spawn } from 'node:child_process';
const config = JSON.parse(execFileSync('supabase', ['status','--workdir','dev/pura-vida.local','--output','json'], { encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'] }));
if (!['http://127.0.0.1:56000','http://localhost:56000'].includes(config.API_URL)) throw new Error('Expected isolated local Supabase API.');
const child = spawn('deno', ['run','--node-modules-dir=none','--allow-net','--allow-env','--allow-read','scripts/serve-local-functions.ts'], {
  env: {...process.env,SUPABASE_URL:config.API_URL,SUPABASE_ANON_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY},stdio:'inherit',windowsHide:true,
});
child.on('exit',code=>{process.exitCode=code??1;});
