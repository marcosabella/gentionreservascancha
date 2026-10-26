import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

async function moduleAt(path) {
  const result = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { generateTimeSlots, generateTimeOptionsForDropdown, calculateDuration } = await moduleAt('src/utils/timeSlots.ts');
const { addMinutesToTime, timeRangesOverlap } = await moduleAt('src/utils/availability.ts');
const log = console.log;
console.log = () => {};
const slots = (bookings = [], recurring = [], unavailable = [], end = '00:30') => generateTimeSlots(bookings, recurring, unavailable, 'court', '2031-03-01', '12:30', end);
assert.deepEqual(slots().map(s => s.time), ['12:30','14:00','15:30','17:00','18:30','20:00','21:30','23:00']);
assert.equal(slots([], [], [], '24:00').at(-1).time, '21:30');
assert.equal(generateTimeOptionsForDropdown('12:30', '00:30').at(-1), '23:00');
assert.equal(generateTimeOptionsForDropdown('08:00', '22:00').at(-1), '20:30');
assert.equal(addMinutesToTime('23:00', 90), '00:30');
assert.equal(calculateDuration('23:00', '00:30'), 1.5);
assert.equal(timeRangesOverlap('23:00:00', '00:30:00', '22:30', '24:00'), true);
assert.equal(timeRangesOverlap('21:30', '23:00', '23:00', '00:30'), false);
const booked = slots([{id:'booking',courtId:'court',date:'2031-03-01',startTime:'23:00:00',endTime:'00:30:00',status:'confirmed',createdAt:'2031-01-01'}]);
assert.equal(booked.at(-1).available, false);
assert.equal(booked.at(-1).bookingId, 'booking');
assert.equal(booked.at(-2).available, true);
assert.equal(slots([], [{id:'fixed',courtId:'court',dayOfWeek:6,isActive:true,skipDates:[],startTime:'23:00',endTime:'00:30'}]).at(-1).available, false);
assert.equal(slots([], [], [{id:'blocked',courtId:'court',date:'2031-03-01',isActive:true,isRecurring:false,startTime:'22:45',endTime:'23:30'}]).at(-1).available, false);
console.log = log;
console.log('PASS: 8 slots, midnight duration, dropdowns, bookings, recurring turns and blocked times.');
if (process.argv.includes('--database')) {
  const migration = readFileSync('supabase/migrations/20261026090000_overnight_booking_slots.sql', 'utf8');
  const sql = `BEGIN;
${migration}
DO $test$ DECLARE u uuid := gen_random_uuid(); p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); b uuid; payload jsonb;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(u,u::text||'@example.invalid');
  INSERT INTO public.players(id,name,email,phone) VALUES(p,'Overnight test','test@example.invalid','000');
  INSERT INTO public.user_profiles(id,username,password_hash,role,player_id,is_active) VALUES(u,u::text,'unused-test','player',p,true);
  INSERT INTO public.courts(id,name,description,start_time,end_time,price_per_turn) VALUES(c,'Overnight test','Test','12:30','00:30',1200);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,status) VALUES(c,'Overnight test','2031-03-01','21:30','23:00',1200,'confirmed');
  payload := jsonb_build_object('courtId',c,'date','2031-03-01','startTime','23:00','endTime','00:30','players',jsonb_build_array(jsonb_build_object('id',p)),'consumptions','[]'::jsonb);
  b := public.player_create_booking(payload);
  IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE id=b AND start_time='23:00' AND end_time='00:30') THEN RAISE EXCEPTION 'Overnight booking missing'; END IF;
  BEGIN
    PERFORM public.player_create_booking(payload);
    RAISE EXCEPTION 'Duplicate accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  BEGIN
    PERFORM public.player_create_booking(payload || jsonb_build_object('startTime','22:30','endTime','00:00'));
    RAISE EXCEPTION 'Overlap accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF public.booking_times_overlap('21:30','23:00','23:00','00:30') THEN RAISE EXCEPTION 'Adjacent turns conflict'; END IF;
END; $test$;
ROLLBACK;`;
  execFileSync('docker', ['exec', '-i', 'supabase_db_pura-vida-dev', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {input:sql,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
  console.log('PASS: PostgreSQL saves 23:00–00:30 and rejects duplicate/overlapping reservations; test rolled back.');
}
