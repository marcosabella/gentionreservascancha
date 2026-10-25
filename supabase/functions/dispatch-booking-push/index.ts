import { createClient } from '@supabase/supabase-js';
import { sendPush, type PushJob } from './push.ts';

// Only the database dispatcher can call this worker. Browser JWTs and public
// anon keys cannot send notifications or choose recipients/payloads.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const expected = Deno.env.get('BOOKING_PUSH_DISPATCH_TOKEN');
  const supplied = req.headers.get('x-push-dispatch-token');
  if (!expected || !supplied || supplied.length !== expected.length) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([expected, supplied].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  if (!new Uint8Array(a).every((value, index) => value === new Uint8Array(b)[index])) return new Response(null, { status: 401 });
  const publicKey = Deno.env.get('BOOKING_PUSH_PUBLIC_KEY');
  const privateKey = Deno.env.get('BOOKING_PUSH_PRIVATE_KEY');
  const appUrl = Deno.env.get('BOOKING_PUSH_APP_URL');
  if (!publicKey || !privateKey || !appUrl) return new Response(null, { status: 503 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await db.rpc('claim_booking_push');
    if (error) throw error;
    const jobs = (data ?? []) as PushJob[];
    let sent = 0;
    // Bound concurrent requests and execution time; cron drains further batches.
    for (let offset = 0; offset < jobs.length; offset += 5) {
      await Promise.all(jobs.slice(offset, offset + 5).map(async job => {
        // Recheck immediately before sending, including logouts/role changes
        // that occurred after the job was claimed.
        const { data: current, error: lookupError } = await db.rpc('booking_push_job_current', { job: job.id, claim: job.lease });
        if (lookupError) throw lookupError;
        let status = current ? 0 : 409;
        try { if (current) status = await sendPush(job, { publicKey, privateKey, appUrl }); }
        catch { /* Do not log subscription URLs, encryption keys or credentials. */ }
        const { error: finishError } = await db.rpc('finish_booking_push', { job: job.id, claim: job.lease, result_status: status });
        if (finishError) throw finishError;
        if (status >= 200 && status < 300) sent++;
      }));
    }
    return Response.json({ claimed: jobs.length, accepted: sent });
  } catch {
    console.error('Booking push worker failed; outstanding leases will be retried.');
    return new Response(null, { status: 500 });
  }
});
