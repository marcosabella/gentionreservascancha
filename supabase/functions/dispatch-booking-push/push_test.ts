import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import webpush from 'web-push';
import ece from 'npm:http_ece@1.2.0';
import { sendPush, pushPayload, validPushEndpoint, type PushJob } from './push.ts';

const vapid = webpush.generateVAPIDKeys();
const receiver = createECDH('prime256v1'); receiver.generateKeys();
const auth = randomBytes(16);
const job: PushJob = {
  id: crypto.randomUUID(), lease: crypto.randomUUID(), subscriptionId: crypto.randomUUID(),
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  notificationId: crypto.randomUUID(), kind: 'created', court: 'Cancha 1', date: '2026-10-24', start: '18:00:00', end: '19:30:00',
};
const config = { publicKey: vapid.publicKey, privateKey: vapid.privateKey, appUrl: 'https://example.test/' };

Deno.test('Club announcements carry a bounded Unicode preview and open the player inbox', async () => {
  const announcement: PushJob = { ...job, kind: 'announcement', announcementId: crypto.randomUUID(), title: 'Torneo', body: '🎾'.repeat(2000) };
  const payload = pushPayload(announcement);
  assert.equal(payload.type, 'player-announcement');
  assert.equal(payload.announcementId, announcement.announcementId);
  assert.equal(payload.body, '🎾'.repeat(180) + '…');
  assert.equal('notificationId' in payload, false);
  assert.equal(await sendPush(announcement, config, (async (_url, init) => {
    const decrypted = ece.decrypt(Buffer.from((init as RequestInit).body as Uint8Array), { version:'aes128gcm',privateKey:receiver,authSecret:auth });
    assert.deepEqual(JSON.parse(decrypted.toString()), payload);
    return new Response(null, {status:201});
  }) as typeof fetch), 201);
});

Deno.test('Encrypted push decrypts at the device and carries a valid VAPID signature', async () => {
  let requests = 0;
  const status = await sendPush(job, config, (async (url, init) => {
    const request = init as RequestInit;
    requests++;
    assert.equal(url, job.endpoint);
    assert.equal(request.redirect, 'error');
    const headers = new Headers(request.headers);
    assert.equal(headers.get('content-encoding'), 'aes128gcm');
    assert.equal(headers.get('ttl'), '3600');
    const payload = ece.decrypt(Buffer.from(request.body as Uint8Array), { version: 'aes128gcm', privateKey: receiver, authSecret: auth });
    assert.deepEqual(JSON.parse(payload.toString()), pushPayload(job));
    const authorization = headers.get('authorization')!;
    const token = authorization.match(/t=([^, ]+)/)![1];
    const [head, body, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    assert.equal(claims.aud, 'https://fcm.googleapis.com');
    assert.equal(claims.sub, config.appUrl);
    const key = Buffer.from(vapid.publicKey, 'base64url');
    const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key.subarray(1, 33).toString('base64url'), y: key.subarray(33).toString('base64url') }, format: 'jwk' });
    assert(verify('sha256', Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
    return new Response(null, { status: 201 });
  }) as typeof fetch);
  assert.equal(status, 201); assert.equal(requests, 1);
});

Deno.test('Only browser push provider endpoints are allowed; no redirects or local addresses', async () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/test', 'https://updates.push.services.mozilla.com/wpush/v2/example', 'https://web.push.apple.com/example', 'https://wns2.notify.windows.com/example']) assert(validPushEndpoint(endpoint));
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com@evil.test/x', 'https://fcm.googleapis.com:444/x', 'https://web.push.apple.com/x#fragment', 'invalid']) {
    assert(!validPushEndpoint(endpoint));
    assert.equal(await sendPush({ ...job, endpoint }, config, (() => { throw Error('Must not fetch'); }) as typeof fetch), 400);
  }
});

Deno.test('Provider failures propagate for durable retries and invalid subscription cleanup', async () => {
  for (const status of [404, 410, 429, 503]) assert.equal(await sendPush(job, config, (async () => new Response(null, { status })) as typeof fetch), status);
  await assert.rejects(() => sendPush(job, config, (async () => { throw Error('network'); }) as typeof fetch));
  assert(pushPayload({ ...job, kind: 'cancelled' }).title.includes('canceló'));
  assert(!JSON.stringify(pushPayload(job)).includes('privateKey'));
});

Deno.test('Reminder payload opens the player booking and expires before the turn starts', async () => {
  const reminder = { ...job, kind: 'reminder' as const, bookingId: crypto.randomUUID(), startsAt: new Date(Date.now() + 30 * 60000).toISOString() };
  const payload = pushPayload(reminder);
  assert.equal(payload.type, 'booking-reminder');
  assert.equal(payload.bookingId, reminder.bookingId);
  assert.equal(payload.title, 'Recordatorio de tu turno');
  assert.equal('notificationId' in payload, false, 'Reminders must not open the admin notification feed');
  assert.equal(await sendPush(reminder, config, (async (_url, init) => {
    const headers = new Headers((init as RequestInit).headers);
    const ttl = Number(headers.get('ttl'));
    assert(ttl > 1790 && ttl <= 1800, 'An offline device must not receive this after the scheduled start');
    return new Response(null, { status: 201 });
  }) as typeof fetch), 201);
  for (const startsAt of [new Date(Date.now()-1000).toISOString(), 'invalid']) {
    assert.equal(await sendPush({ ...reminder, startsAt }, config, (() => { throw Error('Expired push must not send'); }) as typeof fetch), 409);
  }
});
