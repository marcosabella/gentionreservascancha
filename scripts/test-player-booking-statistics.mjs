import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../tmp/stock-test/node_modules/@electric-sql/pglite/dist/index.js';

process.on('uncaughtException', error => { console.error(error.message, error.where || ''); process.exit(1); });
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, created_at timestamptz,
      last_sign_in_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}', encrypted_password text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;`);
  await db.exec(readFileSync('supabase/pura-vida-public-schema.sql', 'utf8'));
  const ids = [1, 2, 3, 4, 5].map(n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  const [a, b, c, first, second] = ids;
  await db.exec(`INSERT INTO public.players(id,name,email,phone,total_bookings,last_booking) VALUES
    ('${a}','A','','',0,NULL), ('${b}','B','','',0,NULL), ('${c}','C','','',99,'2000-01-01');
    INSERT INTO public.bookings(id,court_name,date,start_time,end_time,status,is_recurring) VALUES
    ('${first}','Cancha','2026-11-10','10:00','11:30','completed',false),
    ('${second}','Cancha','2026-11-20','10:00','11:30','confirmed',true);
    INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer) VALUES
    ('${first}','${a}','A','','',true), ('${first}','${b}','B','','',false),
    ('${second}','${a}','A','','',true);`);
  const migration = readFileSync('supabase/migrations/20261117120000_player_booking_statistics.sql', 'utf8');
  await db.exec(migration);
  async function check(id, count, date) {
    const { rows } = await db.query('SELECT total_bookings, last_booking::text FROM public.players WHERE id=$1', [id]);
    assert.deepEqual(rows[0], { total_bookings: count, last_booking: date });
  }
  await check(a, 2, '2026-11-20');
  await check(b, 1, '2026-11-10');
  await check(c, 0, null);
  await db.exec(`UPDATE public.bookings SET status='cancelled' WHERE id='${second}'`);
  await check(a, 1, '2026-11-10');
  await db.exec(`UPDATE public.bookings SET status='pending',date='2026-11-21' WHERE id='${second}'`);
  await check(a, 2, '2026-11-21');
  await db.exec(`UPDATE public.bookings SET status='in-progress' WHERE id='${second}';
    UPDATE public.bookings SET status='completed' WHERE id='${second}'`);
  await check(a, 2, '2026-11-21');
  await db.exec(`UPDATE public.booking_players SET player_id='${c}' WHERE booking_id='${second}'`);
  await check(a, 1, '2026-11-10');
  await check(c, 1, '2026-11-21');
  await db.exec(`DELETE FROM public.booking_players WHERE player_id='${b}'`);
  await check(b, 0, null);
  await db.exec(`DELETE FROM public.bookings WHERE id='${second}'`);
  await check(c, 0, null);
  // Player-only roles can add a booking member through their existing policies;
  // the trigger must update statistics without direct UPDATE access to players.
  await db.exec(`SET row_security = on;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT INSERT ON public.booking_players TO authenticated;
    CREATE POLICY statistics_test_insert ON public.booking_players FOR INSERT TO authenticated WITH CHECK (true);
    SET ROLE authenticated;
    INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone)
      VALUES ('${first}','${b}','B','',''); RESET ROLE;`);
  await check(b, 1, '2026-11-10');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query(`SELECT public.refresh_player_booking_statistics('${a}')`), /permission denied/);
  await db.exec('RESET ROLE');
  await db.exec(migration);
  await check(a, 1, '2026-11-10');
  await check(b, 1, '2026-11-10');
  console.log('PASS: historical repair, all participants, recurring bookings, cancellation, reactivation, dates, reassignment, deletion, permissions and idempotency.');
} finally {
  await db.close();
}
