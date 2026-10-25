import assert from 'node:assert/strict';
import { createECDH, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { pwaWorker } from './pwa-build.mjs';

const compiled = await build({ entryPoints: ['src/services/bookingPushService.ts'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"' },
  plugins: [{ name: 'mock-db', setup(builder) {
    builder.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'mock', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const supabase = globalThis.__db;' }));
  } }],
});
const stored = new Map(), calls = [];
let active = null, failRegister = false, failRemove = false, permissionCalls = 0, subscribed = 0, removed = 0;
const localNotices = [];
const settings = { publicKey: (() => { const key = createECDH('prime256v1'); key.generateKeys(); return key.getPublicKey().toString('base64url'); })(), enabled: true };
let failLocalNotice = false;
const registration = { showNotification: async (title, options) => { if (failLocalNotice) throw Error('system blocked'); localNotices.push({title,options}); }, pushManager: {
  getSubscription: async () => active,
  subscribe: async options => {
    assert.equal(options.userVisibleOnly, true); assert.equal(options.applicationServerKey.length, 65); subscribed++;
    active = { endpoint: `https://fcm.googleapis.com/${subscribed}`, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'test', auth: 'test' } }; },
      unsubscribe: async () => { removed++; active = null; return true; } };
    return active;
  },
} };
const context = { module: { exports: {} }, exports: {}, setTimeout, clearTimeout, Uint8Array, atob,
  window: { isSecureContext: true, PushManager: {}, Notification: {}, location: { hostname: 'example.test' } },
  navigator: { serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } },
  localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
  Notification: { permission: 'granted', requestPermission: () => { permissionCalls++; return Promise.resolve('granted'); } },
  __db: { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'booking_push_settings' ? settings : 'id', error: name === 'register_booking_push' && failRegister || name === 'unregister_booking_push' && failRemove ? { message: 'network' } : null }; } },
};
runInNewContext(compiled.outputFiles[0].text, context);
const { bookingPushService: service, pushOwner, supportsBookingPush } = context.module.exports;
assert(supportsBookingPush());
const promise = service.enable('admin-a', settings);
assert.equal(permissionCalls, 1, 'Permission is requested synchronously from the click gesture');
await promise;
assert.equal(pushOwner(), 'admin-a'); assert.equal(subscribed, 1);
assert.equal(calls.at(-1).name, 'register_booking_push');
const callsBeforeTest = calls.length;
await service.testNotification();
assert.equal(localNotices.length,1); assert.equal(localNotices[0].title,'Prueba de notificaciones');
assert(localNotices[0].options.tag.startsWith('booking-push-local-test-')); assert.equal(calls.length,callsBeforeTest,'Local display test does not send a server push or create messages');
failLocalNotice=true; await assert.rejects(service.testNotification()); failLocalNotice=false;
context.Notification.permission='denied'; await assert.rejects(service.testNotification());context.Notification.permission='granted';
await service.enable('admin-b', settings);
assert.equal(pushOwner(), 'admin-b'); assert.equal(removed, 1, 'Changing users replaces the old device subscription');
await service.disable(); assert.equal(pushOwner(), null); assert.equal(active, null);
failRegister = true;
await assert.rejects(service.enable('admin-a', settings));
assert.equal(active, null, 'Registration failure removes the browser subscription');
failRegister = false;
await service.enable('admin-a', settings);
failRemove = true;
await assert.rejects(service.disable());
assert.equal(pushOwner(), null); assert.equal(active, null, 'Offline cleanup still stops browser delivery');
context.window.isSecureContext = false; assert(!supportsBookingPush());

for (const brand of ['PADEL CENTER', 'PURA VIDA']) {
  const handlers = new Map(), shown = [], posted = [], opened = [];
  let windows = [], focused = 0, closed = 0;
  const scope = 'https://example.test/app/';
  runInNewContext(pwaWorker(brand), {
    URL, Response, fetch,
    self: {
      registration: { scope, showNotification: async (title, options) => { shown.push({ title, options }); } },
      location: { origin: 'https://example.test' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      clients: { matchAll: async () => windows, openWindow: async url => { opened.push(url); } },
    },
  });
  const id = randomUUID();
  let done;
  const payload = { notificationId: id, title: 'Nueva reserva', body: 'Cancha 1', url: 'https://evil.test/' };
  handlers.get('push')({ data: { json: () => payload }, waitUntil: promise => { done = promise; } }); await done;
  assert.equal(shown[0].options.tag, `booking-${id}`);
  assert(shown[0].options.icon.startsWith(scope));
  assert(shown[0].options.icon.includes(brand === 'PURA VIDA' ? 'pura-vida' : 'padel-center'));
  handlers.get('push')({ data: { json: () => { throw Error('bad'); } }, waitUntil: promise => { done = promise; } }); await done;
  assert(shown[1].options.body.includes('nuevo aviso'), 'Malformed/empty payload still displays a notification');
  const click = () => ({ notification: { data: { notificationId: id }, close: () => { closed++; } }, waitUntil: promise => { done = promise; } });
  handlers.get('notificationclick')(click()); await done;
  assert.equal(opened[0], `${scope}?bookingNotice=${id}`, 'Never open a URL supplied by a push payload');
  windows = [{ url: scope, focus: async () => { focused++; }, postMessage: message => posted.push(message) }];
  handlers.get('notificationclick')(click()); await done;
  assert.equal(focused, 1); assert.equal(posted[0].id, id); assert.equal(opened.length, 1); assert.equal(closed, 2);
  const bookingId = randomUUID();
  handlers.get('push')({ data: { json: () => ({ type: 'booking-reminder', bookingId, scheduledStart: '2026-10-24T18:00:00Z', title: 'Recordatorio de tu turno' }) }, waitUntil: promise => { done = promise; } }); await done;
  assert(shown[2].options.tag.startsWith(`reminder-${bookingId}-`));
  assert.equal(shown[2].options.data.bookingId, bookingId);
  windows = [];
  const reminderClick = () => ({ notification: { data: shown[2].options.data, close: () => {} }, waitUntil: promise => { done = promise; } });
  handlers.get('notificationclick')(reminderClick()); await done;
  assert.equal(opened[1], `${scope}?bookingReminder=${bookingId}`);
  windows = [{ url: scope, focus: async () => {}, postMessage: message => posted.push(message) }];
  handlers.get('notificationclick')(reminderClick()); await done;
  assert.equal(posted.at(-1).type, 'OPEN_PLAYER_BOOKING_REMINDER'); assert.equal(posted.at(-1).id, bookingId);
  const announcementId = randomUUID();
  handlers.get('push')({ data: { json: () => ({ type: 'player-announcement', announcementId, title: 'Torneo del club', body: 'Inscripción abierta' }) }, waitUntil: promise => { done = promise; } }); await done;
  assert.equal(shown[3].options.tag, `announcement-${announcementId}`);
  assert.equal(shown[3].options.body, 'Inscripción abierta');
  const announcementClick = () => ({ notification: { data: shown[3].options.data, close: () => {} }, waitUntil: promise => { done = promise; } });
  windows = [];
  handlers.get('notificationclick')(announcementClick()); await done;
  assert.equal(opened.at(-1), `${scope}?playerAnnouncement=${announcementId}`);
  windows = [{ url: scope, focus: async () => {}, postMessage: message => posted.push(message) }];
  handlers.get('notificationclick')(announcementClick()); await done;
  assert.equal(posted.at(-1).type, 'OPEN_PLAYER_ANNOUNCEMENT'); assert.equal(posted.at(-1).id, announcementId);
}
console.log('PASS: permission gesture, account switching, subscription cleanup, offline disable, encrypted-key registration, push display, malformed payload fallback and safe notification navigation.');
