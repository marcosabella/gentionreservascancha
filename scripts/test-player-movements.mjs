import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/playerMovements.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { getPlayerMovements } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const players = [{ id: 'me', paymentSplits: [{ method: 'cash', amount: 100 }, { method: 'transfer', amount: 100 }, { method: 'current_account', amount: 50 }] }, { id: 'other', paymentMethod: 'card' }];
const booking = { id: 'b', date: '2026-10-20', startTime: '10:00', endTime: '11:30', courtName: 'Cancha 1', status: 'completed', totalPrice: 400, players, consumptions: [
  { name: 'Agua', price: 100, quantity: 1, splitBetweenPlayers: true },
  { name: 'Comida ajena', price: 800, quantity: 1, assignedToPlayers: ['other'] },
  { name: 'Mi consumo', price: 50, quantity: 1, assignedToPlayers: ['me'] },
] };
const sales = ['cash', 'card', 'transfer', 'current_account'].map((paymentMethod, i) => ({ id: `s${i}`, type: 'direct', customer: { id: 'me' }, date: '2026-10-21', time: '12:00', totalAmount: 100, paymentMethod, items: [{ name: 'Agua', quantity: 1, subtotal: 100 }] }));
sales.push({ ...sales[0], id: 'foreign', customer: { id: 'other' } }, { ...sales[0], id: 'booking-sale', type: 'booking', bookingId: 'b' });
const entries = [
  { id: 'debt-b', playerId: 'me', type: 'debit', amount: 100, relatedBookingId: 'b' },
  { id: 'debt-s', playerId: 'me', type: 'debit', amount: 100, relatedSaleId: 's3' },
  { id: 'receipt', playerId: 'me', type: 'credit', amount: 50, paymentMethod: 'card', date: '2026-10-22', time: '11:00', description: 'Pago' },
  { id: 'legacy', playerId: 'me', type: 'debit', amount: 30, date: '2026-10-19', time: '11:00', description: 'Cargo anterior', relatedSaleId: 'missing' },
];
const movements = getPlayerMovements('me', [booking, { ...booking, id: 'pending', status: 'confirmed' }], sales, entries);
assert.equal(movements.length, 7, 'Each operation appears once, preserving receipts and historical entries');
assert.equal(movements[0].id, 'account:receipt');
const turn = movements.find(m => m.id === 'booking:b');
assert.equal(turn.amount, 300, 'Only the player share, including assigned consumptions');
assert.equal(turn.items.reduce((sum, item) => sum + item.amount, 0), 300);
assert.equal(turn.payments.find(p => p.method === 'current_account').amount, 100, 'Unpaid remainder follows existing credit calculation');
assert(!turn.items.some(item => item.name.includes('ajena')));
assert.equal(turn.debit, 300);
assert.equal(turn.paid, 200);
assert.equal(turn.balance, -130);
assert.equal(movements[0].balance, -180, 'Final ledger balance reconciles to the actual account entries');
for (const movement of movements) assert.equal(Math.round((movement.paid - movement.debit) * 100), Math.round((movement.balance - (movements[movements.indexOf(movement) + 1]?.balance ?? 0)) * 100));
const cashSale = movements.find(m => m.id === 'sale:s0');
assert.equal(cashSale.debit, 100);
assert.equal(cashSale.paid, 100, 'A cash purchase does not increase debt');
for (const method of ['cash', 'card', 'transfer', 'current_account']) assert(movements.some(m => m.kind === 'Venta' && m.payments[0].method === method));
const legacy = getPlayerMovements('me', [{ ...booking, players: [{ id: 'me', paymentMethod: 'card' }, { id: 'other' }] }], [], []);
assert.equal(legacy[0].payments[0].method, 'card');
assert.equal(legacy[0].payments[0].amount, 300);
assert.deepEqual(getPlayerMovements('stranger', [booking], sales, entries), []);

// Render the real account component with an accidentally supplied deletion callback.
const rendered = buildSync({ stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Detail from './src/components/CurrentAccountDetail';
import { AccessContext } from './src/config/AccessContext';
const account = { playerId: 'me', playerName: 'Jugador', balance: -10, entries: [{id:'e', type:'debit', date:'2026-10-20', time:'10:00', amount:10, description:'Cargo'}] };
export function render(role, permissions = [], movements) {
  return renderToStaticMarkup(<AccessContext.Provider value={{ id:'u', role, permissions }}><Detail account={account} onDeleteEntry={() => {}} onClose={() => {}} isModal={false} movements={movements} /></AccessContext.Provider>);
}`, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
const mod = { exports: {} };
new Function('require', 'module', 'exports', rendered.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
assert(!mod.exports.render('player').includes('Eliminar movimiento'));
assert(!mod.exports.render('player').includes('>Acciones<'));
assert(mod.exports.render('admin').includes('Eliminar movimiento'));
assert(!mod.exports.render('employee', ['accounts.view']).includes('Eliminar movimiento'));
const html = mod.exports.render('player', [], movements);
assert(!html.includes('Eliminar movimiento'));
assert(html.includes('<table') && html.includes('>Debe<') && html.includes('>Haber<') && html.includes('>Saldo<'));
assert(html.includes('Ver detalle:') && html.includes('<dialog'));
console.log('OK: player history, payment methods, own shares, duplicates, running ledger balance, detail controls, and deletion permissions');
