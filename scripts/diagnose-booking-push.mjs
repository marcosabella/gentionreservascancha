import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const projects={'padel-center':'zcixnnzxxkylotbjudhk','pura-vida':'qsvdpdifygmzdawxfyqv'};
const name=process.argv[2],project=projects[name];assert(project,'Expected padel-center|pura-vida');
const file=resolve(`dev/release.local/${name}-push-diagnose.sql`);
writeFileSync(file,`SELECT jsonb_build_object(
  'settings',(SELECT jsonb_build_object('enabled',enabled,'reminders',reminders_enabled,'app_url',app_url) FROM public.booking_push_config),
  'marcos_abella',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
    SELECT p.name,u.role,u.is_active,s.created_at AS subscribed_at,s.updated_at AS subscription_updated,
      CASE WHEN to_jsonb(a)->>'user_agent' ILIKE '%Android%' THEN 'Android'
        WHEN to_jsonb(a)->>'user_agent' ILIKE '%iPhone%' THEN 'iPhone'
        WHEN to_jsonb(a)->>'user_agent' ILIKE '%Windows%' THEN 'Windows'
        WHEN to_jsonb(a)->>'user_agent' ILIKE '%Macintosh%' THEN 'Mac'
        ELSE 'No identificado' END AS session_device,
      (SELECT count(*) FROM public.player_announcement_recipients r WHERE r.user_id=u.id) AS inbox_messages,
      (SELECT count(*) FROM public.booking_push_deliveries d WHERE d.subscription_id=s.id AND d.state='sent') AS accepted_push
    FROM public.players p JOIN public.user_profiles u ON u.player_id=p.id
    LEFT JOIN public.booking_push_subscriptions s ON s.user_id=u.id LEFT JOIN auth.sessions a ON a.id=s.session_id
    WHERE p.name ILIKE '%marcos%' AND p.name ILIKE '%abella%'
  ) x),
  'subscriptions',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT u.role,split_part(s.endpoint,'/',3) AS provider,count(*) AS devices,count(*) FILTER(WHERE a.id IS NOT NULL AND (a.not_after IS NULL OR a.not_after>now()) AND u.is_active) AS active_sessions FROM public.booking_push_subscriptions s LEFT JOIN public.user_profiles u ON u.id=s.user_id LEFT JOIN auth.sessions a ON a.id=s.session_id GROUP BY u.role,split_part(s.endpoint,'/',3)) x),
  'recent_campaigns',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT n.id,n.created_at,n.result,(SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT state,last_status,attempts,count(*) AS devices,min(finished_at) AS finished_at FROM public.player_announcement_push_history WHERE announcement_id=n.id GROUP BY state,last_status,attempts) y) AS outcomes FROM public.player_announcements n ORDER BY created_at DESC LIMIT 10) x),
  'pending',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT delivery_type,state,attempts,last_status,count(*) AS jobs,count(*) FILTER(WHERE public.booking_push_delivery_allowed(id)) AS allowed,min(created_at) AS oldest,min(next_attempt_at) AS next_attempt FROM public.booking_push_deliveries WHERE state IN ('queued','sending') GROUP BY delivery_type,state,attempts,last_status) x),
  'dispatcher',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT status_code,timed_out,error_msg,created FROM net._http_response ORDER BY created DESC LIMIT 10) x),
  'cron',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT d.status,d.start_time,d.end_time FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='booking-push-retry' ORDER BY d.start_time DESC LIMIT 5) x)
) AS diagnostics;`);
try {
  const output=JSON.parse(execFileSync('supabase',['db','query','--linked','--project-ref',project,'--file',file,'--output','json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
  console.log(JSON.stringify({project,...output.rows[0].diagnostics},null,2));
} catch {throw Error('Remote push diagnosis failed. No credentials printed.');}
