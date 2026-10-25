import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const bundle = buildSync({ entryPoints: ['src/utils/cashRows.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { cashMovementRows } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const cash = { id: 'cash', session_id: 'session', created_at: '2026-10-21T23:08:21.708Z', actor_name: 'padelcenter', kind: 'collection',
  method: 'cash', amount: 8000, source_type: 'booking', source_id: 'booking', description: 'Cobro de reserva', source_detail: ['Jugador de prueba'] };
const transfer = { ...cash, id: 'transfer', method: 'transfer', amount: '30000.00', created_at: '2026-10-21T23:08:21.716Z' };
const rows = cashMovementRows([cash, transfer]);
assert.equal(rows.length, 1);
assert.deepEqual(rows[0].amounts, { cash: 8000, card: 0, transfer: 30000 });
assert.equal(rows[0].entries.length, 2);
assert.equal(cashMovementRows([cash, { ...transfer, source_id: 'another' }]).length, 2);
assert.equal(cashMovementRows([cash, { ...transfer, kind: 'correction' }]).length, 2);
assert.equal(cashMovementRows([cash, { ...transfer, created_at: '2026-10-21T23:10:21Z' }]).length, 2);
assert.equal(cashMovementRows([cash, { ...cash, id: 'another' }]).length, 2);
const expense = { ...cash, id: 'expense', source_type: null, source_id: null, kind: 'expense', amount: -500 };
assert.equal(cashMovementRows([expense, { ...expense, id: 'expense2' }]).length, 2);
const combined = cashMovementRows([cash, transfer, expense]);
assert.equal(combined.reduce((sum, row) => sum + row.amounts.cash, 0), 7500);
assert.equal(combined.flatMap(row => row.entries).length, 3);
const financed = cashMovementRows([{ ...cash, source_detail: ['Jugador A · Cuenta corriente $ 16000,00', 'Jugador B · Sin pago $ 0,00'] }, { ...transfer, source_detail: ['Jugador A · Cuenta corriente $ 16000,00', 'Jugador B · Sin pago $ 0,00'] }]);
assert.equal(financed.length, 1);
assert.equal(financed[0].currentAccount, 16000, 'Financed amount is shown once for a combined receipt');
assert.equal(financed[0].amounts.cash + financed[0].amounts.transfer, 38000, 'Debt is not added to collections');
console.log('PASS: receipt columns, complete ledger detail, separate corrections/expenses, unchanged totals.');
