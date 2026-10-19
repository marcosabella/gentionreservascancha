import { execFileSync, spawn } from 'node:child_process';

const projectRef = 'qsvdpdifygmzdawxfyqv';
// Development uses isolated data by default. Production data needs an explicit
// opt-in, and this command never publishes frontend or backend changes.
const isolated = !process.argv.includes('--production-data');
const result = JSON.parse(execFileSync('supabase', isolated ? [
  'status', '--workdir', 'dev/pura-vida.local', '--output', 'json',
] : [
  'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json',
], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
const keys = Array.isArray(result) ? result : result.api_keys ?? [];
const anonKey = isolated ? result.ANON_KEY : keys.find(key => key.name === 'anon')?.api_key;
if (!anonKey) throw new Error('Pura Vida public API key unavailable.');
if (isolated && !result.API_URL) throw new Error('Start the isolated Supabase environment before Vite.');

const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5173', '--strictPort',
], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: isolated ? result.API_URL : `https://${projectRef}.supabase.co`,
    VITE_SUPABASE_ANON_KEY: anonKey,
    VITE_COMPLEX_NAME: 'PURA VIDA',
    VITE_TEST_ENVIRONMENT: isolated ? 'true' : 'false',
    VITE_SUPABASE_FUNCTIONS_URL: isolated ? 'http://127.0.0.1:56010/functions/v1' : '',
  },
  stdio: 'inherit', windowsHide: true,
});
server.on('exit', code => { process.exitCode = code ?? 1; });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
