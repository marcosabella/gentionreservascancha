import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const siteName = 'complejopuravida';
const projectRef = 'qsvdpdifygmzdawxfyqv';
const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'netlify/Config/config.json'), 'utf8'));
const token = (config.users[config.userId] ?? Object.values(config.users)[0])?.auth?.token;
if (!token) throw new Error('Netlify authentication is unavailable.');

async function api(path, { method = 'GET', body, contentType = 'application/json' } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Netlify ${method} ${path}: ${response.status} ${result?.message ?? 'request failed'}`);
  return result;
}

const sites = await api('/sites?per_page=100');
const existing = sites.find(site => site.name === siteName);
const padel = sites.find(site => site.name === 'padelcenter');
if (process.argv[2] === 'inspect') {
  console.log(JSON.stringify({ totalSites: sites.length, sites: sites.map(site => ({ id: site.id, name: site.name, accountId: site.account_id, accountSlug: site.account_slug, repository: site.build_settings?.repo_url ?? null })), accounts: (await api('/accounts')).map(account => ({ id: account.id, name: account.name, slug: account.slug })) }));
  process.exit(0);
}
if (process.argv[2] !== 'deploy') throw new Error('Expected inspect or deploy.');

// Use the same team as Padel Center. An existing Pura Vida site is reused by name.
const accounts = await api('/accounts');
const accountId = existing?.account_id ?? padel?.account_id ?? accounts[0]?.id;
if (!accountId) throw new Error('No Netlify team available.');
const site = existing ?? await api(`/${padel?.account_slug ?? accounts.find(account => account.id === accountId)?.slug}/sites`, {
  method: 'POST', body: { name: siteName, force_ssl: true, build_settings: { cmd: 'npm run build', dir: 'dist' } },
});
if (site.name !== siteName) throw new Error('Netlify did not assign the requested hostname.');

const keyResult = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
const keys = Array.isArray(keyResult) ? keyResult : keyResult.api_keys;
const anonKey = keys.find(key => key.name === 'anon')?.api_key;
if (!anonKey) throw new Error('Pura Vida public API key not found.');
const environment = {
  VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: anonKey,
  VITE_COMPLEX_NAME: 'PURA VIDA',
};
// Save only public frontend settings on this site. No service role key is deployed.
const envPath = `/accounts/${site.account_id}/env`;
const currentEnv = await api(`${envPath}?site_id=${site.id}`);
for (const [key, value] of Object.entries(environment)) {
  // Omit scope selection so Netlify applies this team's default scopes.
  const definition = { key, values: [{ context: 'all', value }] };
  if (currentEnv.some(variable => variable.key === key)) {
    await api(`${envPath}/${key}?site_id=${site.id}`, { method: 'PUT', body: definition });
  } else {
    await api(`${envPath}?site_id=${site.id}`, { method: 'POST', body: [definition] });
  }
}

const outputDir = resolve('dist/pura-vida');
// Build with the target's variables in memory, overriding the local Padel .env.
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outputDir], {
  env: { ...process.env, ...environment }, stdio: 'inherit', windowsHide: true,
});
writeFileSync(join(outputDir, '_redirects'), '/* /index.html 200\n');
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]);
}
const filePaths = collect(outputDir);
const files = {};
const uploads = new Map();
for (const path of filePaths) {
  const data = readFileSync(path);
  if (/\.js$/.test(path) && data.includes(Buffer.from('zcixnnzxxkylotbjudhk'))) throw new Error('Build contains the Padel Center project reference.');
  const hash = createHash('sha1').update(data).digest('hex');
  const urlPath = `/${relative(outputDir, path).replaceAll('\\', '/')}`;
  files[urlPath] = hash;
  uploads.set(hash, { path: urlPath, data });
}
const deploy = await api(`/sites/${site.id}/deploys`, {
  method: 'POST', body: { files, draft: false, title: 'Pura Vida - base independiente' },
});
for (const hash of deploy.required ?? []) {
  const file = uploads.get(hash);
  if (!file) throw new Error('Netlify requested an unknown file.');
  await api(`/deploys/${deploy.id}/files${file.path}`, { method: 'PUT', contentType: 'application/octet-stream', body: file.data });
}
const metadata = { siteId: site.id, siteName: site.name, url: site.ssl_url ?? site.url, deployId: deploy.id, deployUrl: deploy.deploy_ssl_url ?? deploy.deploy_url, projectRef, sourceRepository: 'https://github.com/marcosabella/gentionreservascancha', deploymentMethod: 'working-tree file digest', deployedAt: new Date().toISOString() };
writeFileSync('supabase/pura-vida-netlify-deployment.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));
