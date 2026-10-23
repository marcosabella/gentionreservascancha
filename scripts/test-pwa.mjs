import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { pwaManifest, pwaWorker } from './pwa-build.mjs';

const compiled = buildSync({ entryPoints: ['src/utils/pwaInstall.ts'], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.hot': 'undefined' } });
const { createInstallController, isAppleMobile } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
class Media extends EventTarget {
  matches = false;
}
class Browser extends EventTarget {
  media = new Media();
  navigator = { standalone: false };
  matchMedia() { return this.media; }
}
function promptEvent(outcome = 'accepted', failure = false) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  let calls = 0;
  event.prompt = async () => { calls++; if (failure) throw Error('Prompt blocked'); };
  event.userChoice = Promise.resolve({ outcome });
  return { event, calls: () => calls };
}
const browser = new Browser(), controller = createInstallController(browser);
let changes = 0;
const unsubscribe = controller.subscribe(() => { changes++; });
controller.start(); controller.start();
assert.equal(controller.getSnapshot().canPrompt, false);
assert.equal(await controller.install(), 'unavailable');
const first = promptEvent();
browser.dispatchEvent(first.event);
assert(first.event.defaultPrevented);
assert.equal(controller.getSnapshot().canPrompt, true, 'The install event is retained before the player panel mounts');
assert.equal(await controller.install(), 'accepted');
assert.equal(first.calls(), 1);
assert.equal(await controller.install(), 'unavailable', 'A browser prompt cannot be reused');
browser.dispatchEvent(new Event('appinstalled'));
assert.equal(controller.getSnapshot().installed, true);
assert.equal(controller.getSnapshot().canPrompt, false);
assert(changes > 0); unsubscribe(); controller.stop();

for (const outcome of ['accepted', 'dismissed']) {
  const window = new Browser(), store = createInstallController(window); store.start();
  const prompt = promptEvent(outcome); window.dispatchEvent(prompt.event);
  assert.equal(await store.install(), outcome);
  assert.equal(store.getSnapshot().prompting, false);
  assert.equal(store.getSnapshot().canPrompt, false);
  store.stop();
}
const failureBrowser = new Browser(), failing = createInstallController(failureBrowser); failing.start();
failureBrowser.dispatchEvent(promptEvent('accepted', true).event);
assert.equal(await failing.install(), 'error'); assert.equal(failing.getSnapshot().prompting, false); failing.stop();
const standalone = new Browser(); standalone.media.matches = true;
const installed = createInstallController(standalone); installed.start();
assert.equal(installed.getSnapshot().installed, true);
installed.stop();
assert(isAppleMobile({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 }));
assert(isAppleMobile({ userAgent: 'Safari desktop style', platform: 'MacIntel', maxTouchPoints: 5 }));
assert(!isAppleMobile({ userAgent: 'Android Chrome', platform: 'Linux', maxTouchPoints: 5 }));

const registration = buildSync({ entryPoints: ['src/utils/registerPwa.ts'], bundle: true, write: false, format: 'iife', globalName: 'PwaRegistration',
  define: { 'import.meta.env.PROD': 'true', 'import.meta.env.BASE_URL': '"./"' } }).outputFiles[0].text;
for (const [url, expected] of [['https://padelcenter.netlify.app/', 1], ['http://localhost/Sistema%20de%20Reservas/', 0], ['https://localhost/', 0], ['http://192.168.1.2/', 0]]) {
  const location = new URL(url), calls = [];
  const context = { URL, window: { location }, document: { readyState: 'complete', baseURI: url }, navigator: {
    serviceWorker: { register: (...args) => { calls.push(args); return Promise.resolve(); } },
  } };
  runInNewContext(registration + ';PwaRegistration.registerPwa();', context);
  assert.equal(calls.length, expected, 'Register only on the public HTTPS app, leaving XAMPP independent');
  if (expected) { assert.equal(calls[0][0], new URL('sw.js', url).href); assert.equal(calls[0][1].updateViaCache, 'none'); }
}

for (const [brand, prefix] of [['PADEL CENTER', 'padel-center'], ['PURA VIDA', 'pura-vida']]) {
  const manifest = pwaManifest(brand);
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './'); assert.equal(manifest.id, './');
  for (const icon of manifest.icons) {
    assert(icon.src.includes(prefix));
    const data = readFileSync('public/' + icon.src.slice(2));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
  }
  const apple = readFileSync(`public/pwa/${prefix}-180.png`);
  assert.equal(apple.readUInt32BE(16), 180);
  const handlers = new Map();
  let offline = false, fetched = 0, installedWorker = false;
  runInNewContext(pwaWorker(brand), {
    self: { location: { origin: 'https://example.test' }, clients: { claim: () => Promise.resolve() }, skipWaiting: () => { installedWorker = true; return Promise.resolve(); }, addEventListener: (name, fn) => handlers.set(name, fn) },
    URL, Response, fetch: async (request, options) => { fetched++; assert.equal(options.cache, 'no-store'); if (offline) throw Error('Offline'); return new Response('fresh page'); },
  });
  await handlers.get('install')({ waitUntil: promise => promise }); assert(installedWorker);
  let response;
  handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'fresh page');
  offline = true;
  handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/' }, respondWith: promise => { response = promise; } });
  const fallback = await response;
  assert.equal(fallback.status, 503); assert((await fallback.text()).includes('Necesitás conexión'));
  for (const request of [
    { method: 'GET', mode: 'cors', url: 'https://database.example/rest/v1/bookings' },
    { method: 'POST', mode: 'navigate', url: 'https://example.test/' },
    { method: 'GET', mode: 'same-origin', url: 'https://example.test/__local-update/status' },
  ]) handlers.get('fetch')({ request, respondWith: () => { throw Error('Business or local updater requests must not be intercepted'); } });
  assert.equal(fetched, 2);
}

const renderBundle = buildSync({ stdin: { contents: `
import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
import Install from './src/components/InstallPlayerApp';
export function render() { return renderToStaticMarkup(<Install/>); }
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  define: { 'import.meta.hot': 'undefined', 'import.meta.env.VITE_COMPLEX_NAME': '"PADEL CENTER"', 'import.meta.env.BASE_URL': '"/"' }, external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
const module = { exports: {} };
new Function('require', 'module', 'exports', renderBundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const html = module.exports.render();
assert(html.includes('md:hidden') && html.includes('Instalar app') && html.includes('<dialog'));
console.log('PASS: install event lifecycle, accepted/dismissed/error states, standalone and iOS detection, branded square icons, mobile controls, fresh online navigation, offline notice, and exclusion of account/API/local-update requests.');
