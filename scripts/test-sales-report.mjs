import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/salesReport.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { isSaleInPeriod, getSalePaymentTotals, summarizeSales, matchesSalePayment } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

assert(isSaleInPeriod('2026-10-01', '2026-10-01', '2026-10-31'));
assert(isSaleInPeriod('2026-10-31', '2026-10-01', '2026-10-31'));
assert(!isSaleInPeriod('2026-11-01', '2026-10-01', '2026-10-31'));
assert(!isSaleInPeriod('2026-09-30', '2026-10-01', '2026-10-31'));
assert(isSaleInPeriod('2026-10-15', '', '2026-10-31'));
assert(isSaleInPeriod('2026-10-15', '2026-10-01', ''));
assert(isSaleInPeriod('2026-10-15', '', ''));
assert(!isSaleInPeriod('2026-10-15', '2026-10-31', '2026-10-01'));

const booking = {
  type: 'booking', totalAmount: 32000, bookingTotalPrice: 32000, bookingConsumptions: [],
  paymentMethod: 'cash',
  bookingPlayers: [
    { id: 'a', paymentSplits: [{ method: 'cash', amount: 10000 }] },
    { id: 'b', paymentSplits: [{ method: 'card', amount: 10000 }] },
    { id: 'c', paymentSplits: [{ method: 'transfer', amount: 6000 }, { method: 'current_account', amount: 4000 }] },
    { id: 'd', paymentSplits: [{ method: 'cash', amount: 2000 }] },
  ],
};
assert.deepEqual(getSalePaymentTotals(booking), { cash: 12000, card: 10000, transfer: 6000, current_account: 4000, unassigned: 0 });
const direct = { type: 'direct', totalAmount: 1500.25, paymentMethod: 'transfer' };
let summary = summarizeSales([booking, direct]);
assert.equal(summary.total, 33500.25);
assert.equal(summary.payments.transfer, 7500.25);
assert.equal(summary.difference, 0);

// Historical bookings without splits still support assigned consumptions and exact cents.
const legacy = {
  type: 'booking', totalAmount: 103, bookingTotalPrice: 100, paymentMethod: 'cash',
  bookingPlayers: [{ id: 'a', paymentMethod: 'cash' }, { id: 'b', paymentMethod: 'card' }, { id: 'c', paymentMethod: 'transfer' }],
  bookingConsumptions: [{ price: 3, quantity: 1, splitBetweenPlayers: false, assignedToPlayers: ['b'] }],
};
assert.deepEqual(getSalePaymentTotals(legacy), { cash: 33.34, card: 36.33, transfer: 33.33, current_account: 0, unassigned: 0 });
assert.equal(summarizeSales([legacy]).difference, 0);
assert.equal(getSalePaymentTotals({ ...booking, bookingPlayers: [{ id: 'a', paymentSplits: [] }, { id: 'b', paymentSplits: [{ method: 'cash', amount: 32000 }] }] }).cash, 32000);
assert.equal(getSalePaymentTotals({ ...legacy, bookingPlayers: [{ id: 'a' }] }).unassigned, 100);
assert.equal(summarizeSales([{ ...direct, totalAmount: 0.1 }, { ...direct, totalAmount: 0.2 }]).payments.transfer, 0.3);
assert.deepEqual(summarizeSales([]), { total: 0, payments: { cash: 0, card: 0, transfer: 0, current_account: 0, unassigned: 0 }, difference: 0 });
summary = summarizeSales([{ ...booking, totalAmount: 33000 }]);
assert.equal(summary.difference, 1000);
console.log('PASS: inclusive/open date ranges, mixed payments, unequal contributions, historical bookings, assigned consumptions, zero contributions, missing methods, cents, empty periods and payment differences.');

assert(matchesSalePayment(booking, 'all'));
assert(matchesSalePayment(booking, 'card'));
assert(matchesSalePayment(booking, 'transfer'));
assert(matchesSalePayment(booking, 'current_account'));
assert(!matchesSalePayment(direct, 'cash'));
assert(matchesSalePayment(direct, 'transfer'));
assert(!matchesSalePayment({ ...booking, bookingPlayers: [{ id: 'a', paymentSplits: [{ method: 'transfer', amount: 32000 }] }] }, 'cash'));
console.log('PASS: payment filter uses actual payments, including mixed bookings, instead of the default cash method.');
