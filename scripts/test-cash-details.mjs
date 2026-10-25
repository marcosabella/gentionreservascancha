import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const bundle = buildSync({ entryPoints: ['src/utils/cash.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_COMPLEX_NAME': '"PADEL CENTER"', 'import.meta.env.BASE_URL': '"/"' } });
const utils = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const session = { opening_amount: 100, opened_at: '2026-10-21T23:08:00Z' };
const movement = { created_at: session.opened_at, actor_name: 'Operador', kind: 'collection', method: 'cash', amount: 8000,
  description: 'Cobro de reserva', source_type: 'booking', source_id: 'test-reference',
  source_detail: ['Cancha Central · 21/10/2026 · 18:00 a 19:30', 'Jugador de prueba · Efectivo $ 8000,00', '<script>attack</script>'] };
assert.equal(utils.cashTotals(session, [movement]).expected, 8100);
const html = utils.cashReportHtml(session, [movement]);
const csv = utils.cashCsv(session, [movement]);
assert(html.includes('Jugador de prueba'));
assert(html.includes('Cancha Central'));
assert(!html.includes('<script>'));
assert(html.includes('&lt;script&gt;'));
assert(csv.includes('Detalle del origen'));
assert(csv.includes('Jugador de prueba'));
assert.doesNotThrow(() => utils.cashReportHtml(session, [{ ...movement, source_detail: undefined }]));
assert(utils.cashCsv(session, [{ ...movement, source_detail: ['=SUM(A1:A5)'] }]).includes("'=SUM"));
const transfer = { ...movement, id: 'transfer', method: 'transfer', amount: 30000 };
const expense = { ...movement, id: 'expense', kind: 'expense', source_type: null, source_id: null, amount: -500, source_detail: [] };
const report = utils.cashReportHtml(session, [movement, transfer, expense]);
const table = report.slice(report.indexOf('<table>'), report.indexOf('</table>'));
assert(table.includes('Fecha / Responsable'));
for (const heading of ['Efectivo', 'Tarjeta', 'Transferencia', 'Cuenta Corriente', 'Total cobrado']) assert(table.includes(`>${heading}</th>`));
assert.equal((table.match(/<tr>/g) ?? []).length, 4, 'Header, combined receipt, expense, totals');
assert(table.includes('38.000,00'), 'Combined receipt total');
const footer = table.slice(table.indexOf('<tfoot>'));
assert(footer.includes('7.500,00'), 'Cash includes expense');
assert(footer.includes('30.000,00'), 'Transfer total');
assert(footer.includes('37.500,00'), 'Grand total excludes opening fund');
assert.equal((report.match(/Jugador de prueba/g) ?? []).length, 1, 'Origin detail printed once per receipt');
assert(utils.cashReportHtml(session, []).includes('Sin movimientos.'));
assert(report.includes('<th>Jugador</th><th>Medio de pago</th>'));
const named = { ...movement, source_name: 'Organizador <Centro>' };
const namedReport = utils.cashReportHtml(session, [named]);
assert(namedReport.includes('<th>Jugador / Cliente</th><th>Concepto</th>'));
assert(namedReport.includes('<td>Organizador &lt;Centro&gt;</td>'));
assert(utils.cashCsv(session, [named]).includes('Organizador <Centro>'));
const sale = { ...movement, source_type: 'sale', source_name: 'Cliente de venta' };
assert(utils.cashReportHtml(session, [sale]).includes('<td>Cliente de venta</td>'));
assert(utils.cashCsv(session, [sale]).includes('Cliente de venta'));
const splitReport = utils.cashReportHtml(session, [{ ...movement, source_detail: [
  'Detalle recuperado del origen actual (no histórico)',
  'Cancha Central · 21/10/2026 · 18:00 a 19:30',
  'Jugador mixto · Efectivo $ 5000,00 + Transferencia $ 3000,00',
  'Detalle anterior sin formato de pago',
] }]);
assert(splitReport.includes('5.000,00'));
assert(splitReport.includes('3.000,00'));
assert(splitReport.includes('Detalle anterior sin formato de pago'));
assert(!splitReport.includes('Detalle recuperado del origen actual'));
assert(!report.includes('Cuenta Corriente informa la deuda registrada'));
assert(!report.includes('Los egresos y ajustes negativos se muestran con signo menos.'));
const financedReport = utils.cashReportHtml(session, [{ ...movement, source_detail: ['Cavalleri · Cuenta corriente $ 16000,00', 'Salaverry · Sin pago $ 0,00'] }]);
assert(financedReport.includes('Cuenta Corriente'));
assert(financedReport.includes('Salaverry'));
assert(financedReport.includes('Sin pago'));
assert.equal(utils.cashTotals(session, [movement]).collected, 8000, 'Informative credit does not change collection totals');
console.log('PASS: report/CSV detail, escaping, legacy compatibility and cash totals.');
