import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

const output = execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', 'qsvdpdifygmzdawxfyqv', '--file', 'dev/inspect-pura-vida-hours.sql', '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const { rows: [state] } = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1));
assert.equal(state.overnight_support, true);
assert.equal(state.courts.length, 2);
const result = buildSync({ entryPoints: ['src/utils/timeSlots.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { generateTimeSlots } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const log = console.log;
let courts;
try {
  console.log = () => {};
  courts = state.courts.map(court => {
    assert.equal(court.start_time, '12:30');
    assert.equal(court.end_time, '00:30');
    const slots = generateTimeSlots([], [], [], court.id, '2031-03-01', court.start_time, court.end_time);
    assert.equal(slots.length, 8);
    assert.equal(slots.at(-1).time, '23:00');
    assert.equal(slots.at(-1).available, true);
    return { ...court, slots: slots.map(slot => slot.time) };
  });
} finally {
  console.log = log;
}
const verification = { project: 'qsvdpdifygmzdawxfyqv', courts, overnightSupport: true, verifiedAt: new Date().toISOString() };
writeFileSync('supabase/releases/pura-vida-overnight-verification.json', JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification));
