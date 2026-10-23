import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReleaseManifest, PROJECT_ID } from './local-app/release-manifest.mjs';

const php = process.env.PHP_EXECUTABLE ?? (existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
const root = resolve('tmp', `xampp-update-test-${randomUUID()}`);
const packageRoot = join(root, 'package');
await mkdir(root, { recursive: true });
const releases = new Map();
const v1 = 'xampp-release-0001', v2 = 'xampp-release-0002', v3 = 'xampp-release-0003';
async function release(version, directory) {
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'index.html'), `<html><head><script type="module" src="./assets/${version}.js"></script></head><body>${version}</body></html>`);
  await writeFile(join(directory, 'assets', `${version}.js`), `console.log('${PROJECT_ID}', '${version}');`);
  await writeFile(join(directory, 'logo con espacios.png'), Buffer.from([1, 2, 3]));
  const manifest = await createReleaseManifest(directory, { version });
  const files = new Map(await Promise.all(manifest.files.map(async file => [file.path, await readFile(join(directory, file.path.slice(1)))])));
  releases.set(version, { manifest, files });
}
await release(v1, join(packageRoot, 'app'));
await release(v2, join(root, v2)); await release(v3, join(root, v3));
let current = v2, mode = 'normal', override = null;
const remote = createServer((request, response) => {
  if (mode === 'offline') { response.writeHead(503).end(); return; }
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/local-update.json') { response.end(JSON.stringify(override ?? releases.get(current).manifest)); return; }
  if (mode === 'redirect') { response.writeHead(302, { Location: 'https://example.invalid/file' }).end(); return; }
  const file = releases.get(current).files.get(path);
  if (!file) { response.writeHead(404).end(); return; }
  response.end(mode === 'corrupt' && path.endsWith('.js') ? Buffer.from('bad file') : file);
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
const source = `http://127.0.0.1:${remote.address().port}/`;
const invoker = join(root, 'invoke.php');
await writeFile(invoker, `<?php
require $argv[1];
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$updater=new PadelLocalUpdater($input['root'],$input['source'],3,0);
$ok=null;
if($input['action']==='auto')$ok=$updater->update(true,true);
if($input['action']==='check')$ok=$updater->update(false,true);
if($input['action']==='apply')$ok=$updater->update(true,false,$input['version']);
$file=isset($input['path'])?$updater->file($input['path']):null;
echo json_encode(['ok'=>$ok,'status'=>$updater->status(),'file'=>$file,'content'=>$file?base64_encode(file_get_contents($file)):null],JSON_THROW_ON_ERROR);
`);
function invoke(action = 'status', extra = {}) {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(php, [invoker, resolve('scripts/local-app/php/updater.php')], { windowsHide: true });
    let output = '', error = '';
    process.stdout.on('data', chunk => { output += chunk; }); process.stderr.on('data', chunk => { error += chunk; });
    process.on('error', reject); process.on('exit', code => {
      if (code !== 0) reject(new Error(error || output));
      else { try { resolvePromise(JSON.parse(output)); } catch { reject(new Error(output + error)); } }
    });
    process.stdin.end(JSON.stringify({ root: packageRoot, source, action, ...extra }));
  });
}
try {
  let result = await invoke('auto');
  assert.equal(result.ok, true, result.status.lastError ?? 'Automatic update failed');
  assert.equal(result.status.active.version, v2); assert(result.status.updatedAt);
  assert.equal((await invoke('status', { path: '/logo con espacios.png' })).content, 'AQID');
  assert((await invoke('status', { path: `/assets/${v1}.js` })).file, 'Original tabs retain their assets');
  const pointer = join(packageRoot, '.local-updates/state.json');
  const saved = await readFile(pointer, 'utf8');
  current = v3;
  result = await invoke('check');
  assert.equal(result.status.active.version, v2); assert.equal(result.status.phase, 'available');
  mode = 'corrupt'; result = await invoke('apply', { version: v3 });
  assert.equal(result.ok, false); assert.equal(result.status.active.version, v2);
  assert.equal(await readFile(pointer, 'utf8'), saved, 'An incomplete update cannot switch the pointer');
  mode = 'redirect'; assert.equal((await invoke('apply', { version: v3 })).ok, false);
  mode = 'normal';
  const attempts = await Promise.all([invoke('apply', { version: v3 }), invoke('apply', { version: v3 })]);
  assert(attempts.some(item => item.ok));
  assert.equal((await invoke()).status.active.version, v3);
  assert((await invoke('status', { path: `/assets/${v2}.js` })).file, 'Previous version remains available');
  for (const patch of [
    { project: 'another-complex' }, { files: [] },
    { files: [{ path: '/../outside.js', size: 1, sha256: 'a'.repeat(64) }] },
    { files: [{ path: '/bad.php', size: 1, sha256: 'a'.repeat(64) }] },
  ]) {
    override = { ...releases.get(v3).manifest, ...patch };
    result = await invoke('auto');
    assert.equal(result.ok, false); assert.equal(result.status.active.version, v3);
  }
  override = null; mode = 'offline'; result = await invoke('auto');
  assert.equal(result.ok, false); assert.equal(result.status.active.version, v3);
  assert.equal((await invoke('status', { path: '/runtime/updater.php' })).file, null);
  assert.equal((await invoke('status', { path: '/../state.json' })).file, null);
  const active = JSON.parse(await readFile(pointer, 'utf8'));
  await writeFile(join(packageRoot, '.local-updates/releases', active.activeDir, 'assets', `${v3}.js`), 'damaged');
  assert.equal((await invoke()).status.active.version, v2, 'Damaged active files recover the verified previous version');
  console.log('PASS: XAMPP/PHP automatic update, manual activation, separate background check, integrity, concurrent processes, spaced paths, previous assets, source validation, offline fallback and recovery.');
} finally {
  await new Promise(resolve => { remote.close(resolve); remote.closeAllConnections(); });
  if (dirname(root) === resolve('tmp') && basename(root).startsWith('xampp-update-test-')) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
