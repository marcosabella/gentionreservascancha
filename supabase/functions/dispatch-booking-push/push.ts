import webpush from 'web-push';
import { announcementPlainText } from '../_shared/announcementText.ts';

export interface PushJob {
  id: string; lease: string; subscriptionId: string; endpoint: string;
  keys: { p256dh: string; auth: string };
  notificationId: string; kind: 'created' | 'cancelled' | 'reminder' | 'announcement'; court: string; date: string; start: string; end: string;
  announcementId?: string; title?: string; body?: string;
  bookingId?: string; startsAt?: string;
}
export interface PushConfiguration { publicKey: string; privateKey: string; appUrl: string }

export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}

export function pushPayload(job: PushJob) {
  const message = job.kind === 'announcement' ? Array.from(announcementPlainText(job.body ?? '')) : [];
  if (job.kind === 'announcement') return {
    type: 'player-announcement', title: job.title ?? 'Mensaje del club',
    body: message.slice(0, 180).join('') + (message.length > 180 ? '…' : ''),
    announcementId: job.announcementId,
  };
  if (job.kind === 'reminder') return {
    type: 'booking-reminder', title: 'Recordatorio de tu turno',
    body: `${job.court} · ${job.date.split('-').reverse().join('/')} · ${job.start.slice(0, 5)} a ${job.end.slice(0, 5)}. ¡Te esperamos!`,
    bookingId: job.bookingId, scheduledStart: job.startsAt,
  };
  return {
    title: job.kind === 'created' ? 'Nueva reserva de un jugador' : 'Un jugador canceló su reserva',
    // Player identity is shown after opening the authenticated app, not on a lock screen.
    body: `${job.court} · ${job.date.split('-').reverse().join('/')} · ${job.start.slice(0, 5)} a ${job.end.slice(0, 5)}`,
    notificationId: job.notificationId,
  };
}

export async function sendPush(job: PushJob, config: PushConfiguration, transport: typeof fetch = fetch): Promise<number> {
  if (!validPushEndpoint(job.endpoint)) return 400;
  const ttl = job.kind === 'reminder' ? Math.min(3600, Math.floor((Date.parse(job.startsAt ?? '') - Date.now()) / 1000)) : 3600;
  if (!Number.isFinite(ttl) || ttl <= 0) return 409;
  const details = webpush.generateRequestDetails({ endpoint: job.endpoint, keys: job.keys }, JSON.stringify(pushPayload(job)), {
    vapidDetails: { subject: config.appUrl, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: ttl, urgency: 'high',
  });
  const response = await transport(details.endpoint, {
    method: 'POST', headers: details.headers, body: details.body,
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  return response.status;
}
