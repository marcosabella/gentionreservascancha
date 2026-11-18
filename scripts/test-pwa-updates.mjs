import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import pwaBuild from './pwa-build.mjs';

const code = buildSync({ entryPoints: ['src/utils/pwaUpdates.ts'], bundle: true, write: false, format: 'iife', globalName: 'Updates' }).outputFiles[0].text;
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(controller = {}) {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = controller;
  const window = new EventTarget();
  let timer;
  window.setInterval = (callback, delay) => { assert.equal(delay, 60000); timer = callback; };
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const navigator = { serviceWorker, onLine: true };
  const context = { window, document, navigator };
  runInNewContext(code + ';globalThis.api = Updates;', context);
  let checks = 0;
  let fail = false;
  const registration = { update: async () => { checks++; if (fail) throw Error('Offline'); } };
  context.api.watchPwaUpdates(registration);
  return { ...context, serviceWorker, checks: () => checks, poll: () => timer(), fail: () => { fail = true; } };
}
const browser = setup();
await flush();
assert.equal(browser.checks(), 1);
let notices = 0;
const unsubscribe = browser.api.pwaUpdates.subscribe(() => { notices++; });
browser.serviceWorker.dispatchEvent(new Event('controllerchange'));
assert.equal(browser.api.pwaUpdates.getSnapshot(), true);
assert.equal(notices, 1);
browser.serviceWorker.dispatchEvent(new Event('controllerchange'));
assert.equal(notices, 1, 'Duplicate activations do not repeat the notice');
unsubscribe();
for (const [target, name] of [[browser.window, 'focus'], [browser.window, 'online'], [browser.document, 'visibilitychange']]) {
  const before = browser.checks();
  target.dispatchEvent(new Event(name));
  await flush();
  assert.equal(browser.checks(), before + 1);
}
browser.document.visibilityState = 'hidden';
const before = browser.checks();
browser.poll(); await flush();
assert.equal(browser.checks(), before);
browser.document.visibilityState = 'visible';
browser.navigator.onLine = false;
browser.poll(); await flush();
assert.equal(browser.checks(), before);
browser.navigator.onLine = true;
browser.fail(); browser.poll(); await flush();
assert.equal(browser.checks(), before + 1, 'Network errors are caught');
const firstInstall = setup(null);
await flush();
firstInstall.serviceWorker.dispatchEvent(new Event('controllerchange'));
assert.equal(firstInstall.api.pwaUpdates.getSnapshot(), false, 'First installation is not an update');
firstInstall.serviceWorker.dispatchEvent(new Event('controllerchange'));
assert.equal(firstInstall.api.pwaUpdates.getSnapshot(), true);

function workerFor(code) {
  const emitted = [];
  pwaBuild('PADEL CENTER').generateBundle.call({ emitFile: file => emitted.push(file) }, {}, {
    'assets/app.js': { type: 'chunk', code },
    'assets/app.css': { type: 'asset', source: 'body{}' }
  });
  return emitted.find(file => file.fileName === 'sw.js').source;
}
assert.equal(workerFor('version 1'), workerFor('version 1'));
assert.notEqual(workerFor('version 1'), workerFor('version 2'), 'Every code release changes the worker fingerprint');
console.log('PASS: update notices, first install, foreground/resume/online polling, offline failures and release fingerprints.');
