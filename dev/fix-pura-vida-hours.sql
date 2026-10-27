BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='player_create_booking'
      AND pg_get_functiondef(p.oid) LIKE '%booking_times_overlap%'
      AND pg_get_functiondef(p.oid) LIKE '%5400%') THEN
    RAISE EXCEPTION 'Missing overnight player booking support';
  END IF;
  IF (SELECT count(*) FROM public.courts WHERE id IN ('f11ca1c7-e725-4e12-bb3f-225713a869c4','37093194-7575-4029-9f04-991238b23847')
    AND start_time='12:30' AND end_time IN ('24:00','00:30')) <> 2 THEN
    RAISE EXCEPTION 'Unexpected court configuration';
  END IF;
END $$;
UPDATE public.courts SET end_time='00:30'
WHERE id IN ('f11ca1c7-e725-4e12-bb3f-225713a869c4','37093194-7575-4029-9f04-991238b23847')
  AND start_time='12:30' AND end_time='24:00';
COMMIT;
SELECT id,name,start_time,end_time FROM public.courts ORDER BY name;
