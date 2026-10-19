-- Read-only exact counts for every application table and authentication users.
select jsonb_build_object(
  'application_tables', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'rows', ((xpath('/row/row_count/text()', query_to_xml(
        format('select count(*) as row_count from public.%I', tablename), false, true, ''
      )))[1])::text::bigint
    ) order by tablename)
    from pg_tables where schemaname='public'
  ),
  'auth_users', (select count(*) from auth.users)
) as verification;
