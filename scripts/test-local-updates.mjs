import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReleaseManifest, PROJECT_ID, validateManifest } from './local-app/release-manifest.mjs';
import { startLocalServer } from './local-app/local-server.mjs';

const root = resolve('tmp', `local-updates-${randomUUID()}`);
const packageRoot = join(root, 'package');
await mkdir(root, { recursive: true });
const releases = new Map();
async function release(version, directory) {
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'index.html'), `<html><head><script type="module" src="./assets/${version}.js"></script></head><body>${version}</body></html>`);
  await writeFile(join(directory, 'assets', `${version}.js`), `console.log('${PROJECT_ID}', '${version}');`);
  const manifest = await createReleaseManifest(directory, { version });
  const files = new Map(await Promise.all(manifest.files.map(async file => [file.path, await readFile(join(directory, file.path.slice(1)))])));
  const result = { manifest, files }; releases.set(version, result); return result;
}
const v1 = 'test-release-0001', v2 = 'test-release-0002', v3 = 'test-release-0003', v4 = 'test-release-0004';
await release(v1, join(packageRoot, 'app'));
for (const version of [v2, v3, v4]) await release(version, join(root, version));
let current = v2, mode = 'normal', manifestOverride = null;
const remote = createServer((request, response) => {
  if (mode === 'offline') { response.writeHead(503).end(); return; }
  if (mode === 'stall') { response.writeHead(200); response.write(' '); return; }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/local-update.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(manifestOverride ?? releases.get(current).manifest)); return;
  }
  if (mode === 'redirect') { response.writeHead(302, { Location: 'https://example.invalid/elsewhere' }).end(); return; }
  const file = releases.get(current).files.get(pathname);
  if (!file) { response.writeHead(404).end(); return; }
  if (mode === 'corrupt' && pathname.endsWith('.js')) { response.end('bad download'); return; }
  response.end(file);
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
const source = `http://127.0.0.1:${remote.address().port}/`;
let app;
const start = async (startupUpdate = true) => {
  app = await startLocalServer({ root: packageRoot, port: 0, source, startupUpdate, timeoutMs: 1500, checkIntervalMs: 0 });
};
const status = async () => (await fetch(app.url + '/__local-update/status')).json();
async function post(action, body = {}, overrides = {}) {
  const state = await status();
  return fetch(app.url + `/__local-update/${action}`, { method: 'POST', headers: {
    Origin: app.url, 'Content-Type': 'application/json', 'X-Local-Update-Token': state.token, ...overrides,
  }, body: JSON.stringify(body) });
}
try {
  await start();
  const initial = await status();
  assert.equal(initial.active.version, v2, `Startup installs a complete newer version: ${initial.lastError ?? 'no error'}`);
  assert((await status()).updatedAt);
  assert((await (await fetch(app.url)).text()).includes(v2));
  assert.equal((await fetch(app.url + `/assets/${v1}.js`)).status, 200, 'Bundled assets still work for old tabs');

  current = v3;
  let response = await post('check');
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.phase, 'available');
  assert.equal(state.active.version, v2, 'Background checks do not interrupt work');
  assert.equal(state.latest.version, v3);
  assert.equal((await post('apply', { version: v3 }, { Origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await post('apply', { version: v3 }, { 'X-Local-Update-Token': 'invalid' })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(app.url, { headers: { Host: 'untrusted.invalid' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await fetch(app.url + '/runtime/updater.mjs')).status, 404);
  assert.equal((await fetch(app.url + '/.local-updates/state.json')).status, 404);

  mode = 'corrupt';
  const originalState = await readFile(join(packageRoot, '.local-updates', 'state.json'), 'utf8');
  assert.equal((await post('apply', { version: v3 })).status, 409);
  assert.equal((await status()).active.version, v2);
  assert.equal(await readFile(join(packageRoot, '.local-updates', 'state.json'), 'utf8'), originalState, 'Failed download never switches the active pointer');
  mode = 'normal';
  const applied = await Promise.all([post('apply', { version: v3 }), post('apply', { version: v3 })]);
  assert(applied.every(result => result.ok), 'Concurrent requests safely share the update');
  assert.equal((await status()).active.version, v3);
  assert.equal((await fetch(app.url + `/assets/${v2}.js`)).status, 200, 'Previous tab assets survive activation');

  for (const patch of [
    { project: 'another-complex' },
    { files: [{ path: '/../outside.js', sha256: 'a'.repeat(64), size: 1 }] },
    { files: [{ path: '/runtime.mjs', sha256: 'a'.repeat(64), size: 1 }] },
    { files: [{ path: '/C:/outside.js', sha256: 'a'.repeat(64), size: 1 }] },
    { files: [{ path: '/assets/CON.js', sha256: 'a'.repeat(64), size: 1 }] },
    { files: [] },
  ]) {
    manifestOverride = { ...releases.get(v4).manifest, ...patch };
    assert.throws(() => validateManifest(manifestOverride));
    await post('check');
    assert.equal((await status()).active.version, v3, 'Invalid manifests leave the current installation untouched');
  }
  manifestOverride = null;
  current = v4;
  await post('check');
  mode = 'redirect';
  assert.equal((await post('apply', { version: v4 })).status, 409, 'Files cannot redirect to an unrelated host');
  assert.equal((await status()).active.version, v3);
  mode = 'normal';

  const pointer = join(packageRoot, '.local-updates', 'state.json');
  await rename(pointer, pointer + '.backup'); await mkdir(pointer);
  assert.equal((await post('apply', { version: v4 })).status, 409, 'Pointer write failures keep the previous release running');
  assert.equal((await status()).active.version, v3);
  await rmdir(pointer); await rename(pointer + '.backup', pointer);

  mode = 'stall';
  await post('check');
  assert.equal((await status()).active.version, v3, 'Timeouts keep the application available');
  assert.equal((await status()).phase, 'error');
  mode = 'normal';
  await post('check');
  assert((await (await fetch(app.url)).text()).includes(v4), 'Opening a new page applies a complete available update');
  assert.equal((await fetch(app.url + `/assets/${v2}.js`)).status, 200, 'Multiple updates preserve older open tabs');
  assert.equal((await fetch(app.url + '/assets/missing.js')).status, 404, 'Missing assets never fall back to HTML');
  await app.close(); app = null;

  const saved = JSON.parse(await readFile(pointer, 'utf8'));
  await writeFile(join(packageRoot, '.local-updates', 'releases', saved.activeDir, 'assets', `${v4}.js`), 'corrupted disk file');
  mode = 'offline';
  await start(false);
  assert.equal((await status()).active.version, v3, 'A damaged installation recovers the last verified release');
  assert((await (await fetch(app.url)).text()).includes(v3), 'Offline recovery continues to serve the app');
  console.log('PASS: startup and navigation updates, background notice, integrity, atomic activation, concurrent requests, old tabs, timeout/offline recovery, rollback, source identity, path safety and local request protection.');
} finally {
  if (app) await app.close();
  await new Promise(resolve => { remote.close(resolve); remote.closeAllConnections(); });
  if (dirname(root) === resolve('tmp') && basename(root).startsWith('local-updates-')) await rm(root, { recursive: true, force: true });
}
