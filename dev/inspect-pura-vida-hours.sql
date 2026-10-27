SELECT (SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT id, name, start_time, end_time FROM public.courts ORDER BY name) c) AS courts,
 (SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20261026090000') m) AS migration,
 to_regprocedure('public.booking_times_overlap(time without time zone,time without time zone,time without time zone,time without time zone)') IS NOT NULL AS overnight_support;
