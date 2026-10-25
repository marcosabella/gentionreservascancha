import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

const source = readFileSync('supabase/migrations/20261023160000_cash_zero_player_payments.sql', 'utf8');
const repair = source.slice(source.indexOf('WITH corrected AS'), source.indexOf("SELECT pg_notify"));
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_pura-vida-dev', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], {
  input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
// This container is the same isolated database used by the notification tests.
assert.equal(sql('SELECT current_database()').trim(), 'postgres');
if (sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_movements' AND column_name='source_detail'").trim() === '0') {
  sql(readFileSync('supabase/migrations/20261022120000_cash_movement_details.sql', 'utf8'));
}
sql(source);
sql(`BEGIN;
  SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
  DO $test$ DECLARE court uuid; booking uuid; session uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; detail text[]; amount_before numeric; BEGIN
    IF EXISTS(SELECT 1 FROM public.cash_sessions WHERE closed_at IS NULL) THEN RAISE EXCEPTION 'Local register must be closed before testing'; END IF;
    INSERT INTO public.cash_sessions(opened_by,opened_by_name,opening_amount) VALUES(gen_random_uuid(),'Prueba local',0) RETURNING id INTO session;
    INSERT INTO public.courts(name,description,price_per_turn,features) VALUES('Prueba pagos','Prueba',32000,'{}') RETURNING id INTO court;
    INSERT INTO public.players(name,email,phone,current_account_enabled) VALUES('Clavero prueba','test@example.invalid','000',true) RETURNING id INTO p1;
    INSERT INTO public.players(name,email,phone,current_account_enabled) VALUES('Salaverry prueba','test@example.invalid','000',true) RETURNING id INTO p2;
    INSERT INTO public.players(name,email,phone,current_account_enabled) VALUES('Chiapello prueba','test@example.invalid','000',true) RETURNING id INTO p3;
    INSERT INTO public.players(name,email,phone,current_account_enabled) VALUES('Cavalleri prueba','test@example.invalid','000',true) RETURNING id INTO p4;
    INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,final_total,status)
      VALUES(court,'Prueba pagos','2026-10-22','21:00','22:30',32000,32000,'completed') RETURNING id INTO booking;
    INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer,payment_method,payment_splits) VALUES
      (booking,p1,'Clavero prueba','test@example.invalid','000',true,'transfer','[{"method":"transfer","amount":8000}]'),
      (booking,p2,'Salaverry prueba','test@example.invalid','000',false,NULL,'[]'),
      (booking,p3,'Chiapello prueba','test@example.invalid','000',false,'transfer','[{"method":"transfer","amount":8000}]'),
      (booking,p4,'Cavalleri prueba','test@example.invalid','000',false,'current_account','[{"method":"current_account","amount":16000}]');
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT source_detail, amount INTO detail,amount_before FROM public.cash_movements WHERE source_id=booking;
    IF amount_before <> 16000 OR NOT ('Salaverry prueba · Sin pago $ 0,00' = ANY(detail))
      OR NOT ('Cavalleri prueba · Cuenta corriente $ 16000,00' = ANY(detail)) THEN RAISE EXCEPTION 'Invalid receipt snapshot: %',detail; END IF;
    UPDATE public.cash_movements SET source_detail = array_replace(source_detail,'Salaverry prueba · Sin pago $ 0,00','Salaverry prueba · Sin medio informado $ 8000,00') WHERE source_id=booking;
    PERFORM set_config('test.cash_booking',booking::text,true);
  END $test$;
  ${repair}
  DO $test$ DECLARE booking uuid := current_setting('test.cash_booking')::uuid; detail text[]; paid numeric; BEGIN
    SELECT source_detail,amount INTO detail,paid FROM public.cash_movements WHERE source_id=booking;
    IF paid <> 16000 OR NOT ('Salaverry prueba · Sin pago $ 0,00' = ANY(detail)) THEN RAISE EXCEPTION 'Historical presentation repair failed'; END IF;
  END $test$;
  ROLLBACK;`);

const compiled = buildSync({ entryPoints: ['src/utils/bookingPayments.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { playerPaymentAmount } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
assert.equal(playerPaymentAmount({ paymentSplits: [] }, 8000), 0);
assert.equal(playerPaymentAmount({ paymentSplits: [{ method: 'current_account', amount: 16000 }] }, 8000), 16000);
assert.equal(playerPaymentAmount({ paymentSplits: [{ method: 'transfer', amount: 5000 }, { method: 'cash', amount: 3000 }] }, 8000), 8000);
assert.equal(playerPaymentAmount({ paymentMethod: 'cash' }, 8000), 8000, 'Preserve legacy records');
assert.equal(playerPaymentAmount({}, 8000), 0, 'Unknown method is not proof of payment');
console.log('PASS: teammate covers 16000, other player zero, mixed cash/current-account receipt, historical snapshot repair and unchanged ledger amount.');
