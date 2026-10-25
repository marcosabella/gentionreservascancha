import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = buildSync({ stdin: { contents: "export {default as BookingDetail} from './src/components/BookingDetailContent'; export {default as CashDetail} from './src/components/CashMovementDetail';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react-dom', 'lucide-react'],
  define: { 'import.meta.env.VITE_COMPLEX_NAME': '"PADEL CENTER"', 'import.meta.env.BASE_URL': '"/"' },
});
const module = { exports: {} };
runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), console });
const { BookingDetail, CashDetail } = module.exports;
const booking = { id: 'test', courtName: 'Central', date: '2026-10-22', startTime: '21:00', endTime: '22:30', status: 'completed', totalPrice: 32000, finalTotal: 32000, consumptions: [], players: [
  { id: 'clavero', name: 'Clavero', paymentMethod: 'transfer', paymentSplits: [{ method: 'transfer', amount: 8000 }] },
  { id: 'salaverry', name: 'Salaverry', paymentSplits: [] },
  { id: 'chiapello', name: 'Chiapello', paymentMethod: 'transfer', paymentSplits: [{ method: 'transfer', amount: 8000 }] },
  { id: 'cavalleri', name: 'Cavalleri', paymentMethod: 'current_account', paymentSplits: [{ method: 'current_account', amount: 16000 }] },
] };
const html = renderToStaticMarkup(React.createElement(BookingDetail, { booking, getStatusText: () => 'Completada' }));
const salaverry = html.slice(html.indexOf('Salaverry'), html.indexOf('Chiapello'));
assert(salaverry.includes('Sin pago propio'));
assert(/\$\s*0,00/.test(salaverry));
assert(!salaverry.includes('8.000,00'));
const detail = renderToStaticMarkup(React.createElement(CashDetail, { row: {
  description: 'Cobro de reserva', created_at: '2026-10-23T01:39:28Z', actor_name: 'padelcenter', source_type: 'booking', source_id: 'test',
  amounts: { cash: 0, card: 0, transfer: 16000 }, currentAccount: 16000, source_detail: ['Salaverry · Sin pago $ 0,00', 'Cavalleri · Cuenta corriente $ 16000,00'],
}, onClose: () => {} }));
assert(detail.includes('Cuenta Corriente'));
assert(!detail.includes('Total cobrado'));
assert(!detail.includes('La cuenta corriente es deuda registrada'));
assert(detail.includes('flex flex-wrap items-baseline gap-x-3 gap-y-1'));
console.log('PASS: Salaverry renders zero, actual player splits, four payment cards, no redundant total/legend and compact receipt heading.');
