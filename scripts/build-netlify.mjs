import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createReleaseManifest } from './local-app/release-manifest.mjs';

const projects = { 'PADEL CENTER': 'zcixnnzxxkylotbjudhk', 'PURA VIDA': 'qsvdpdifygmzdawxfyqv' };
const brand = process.env.VITE_COMPLEX_NAME;
const project = projects[brand];
if (!project || process.env.VITE_SUPABASE_URL !== `https://${project}.supabase.co` || !process.env.VITE_SUPABASE_ANON_KEY)
  throw new Error('Configure this Netlify site with its matching brand, Supabase URL and public API key.');
const functionsUrl = process.env.VITE_SUPABASE_FUNCTIONS_URL;
if (functionsUrl && functionsUrl !== `https://${project}.supabase.co/functions/v1`)
  throw new Error('The function endpoint does not belong to this complex.');
const version = process.env.COMMIT_REF || `netlify-${Date.now()}`;
process.env.VITE_APP_VERSION = version;
process.env.VITE_TEST_ENVIRONMENT = 'false';
process.env.VITE_DEV_COURT_END_TIME = '';
const output = resolve(process.argv.find(argument => argument.startsWith('--outDir='))?.slice(9) || 'dist');
const outputRelative = relative(process.cwd(), output);
if (!outputRelative || outputRelative.startsWith('..') || /^[A-Za-z]:/.test(outputRelative)) throw new Error('Build output must remain inside the project.');
await build({ build: { outDir: output, emptyOutDir: true } });
await writeFile(join(output, '_redirects'), '/* /index.html 200\n');
await writeFile(join(output, '_headers'), '/sw.js\n  Cache-Control: no-store\n  Content-Type: application/javascript; charset=utf-8\n/manifest.json\n  Cache-Control: no-cache\n  Content-Type: application/manifest+json\n/local-update.json\n  Cache-Control: no-store\n');
async function scripts(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? scripts(path) : path.endsWith('.js') ? await readFile(path, 'utf8') : '';
  }))).flat().join('\n');
}
const bundle = await scripts(output);
if (!bundle.includes(project) || Object.values(projects).some(other => other !== project && bundle.includes(other)) || /127\.0\.0\.1:560|localhost:560/.test(bundle))
  throw new Error('The generated bundle has an incorrect database endpoint.');
if (!bundle.includes('save_shared_sale') || !bundle.includes('Bonificado (sin cobro)')) throw new Error('The generated bundle is missing the current sales features.');
if (brand === 'PADEL CENTER') await createReleaseManifest(output, { version, notes: ['Actualización automática desde GitHub.'] });
console.log(JSON.stringify({ brand, project, version, publishedDirectory: outputRelative, localUpdates: brand === 'PADEL CENTER' }));
