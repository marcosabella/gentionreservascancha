import type { CashMovement, CashSession } from '../types/cash';
import { complexName } from '../config/complex';
import { cashMovementRows } from './cashRows';
import { cashSourceDetails } from './cashSourceDetails';

export const cashMethodLabels = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
export const cashKindLabels = { collection: 'Cobro', correction: 'Ajuste de cobro', manual_in: 'Ingreso manual', expense: 'Gasto', withdrawal: 'Retiro', reversal: 'Anulación manual' };
export const cashSourceLabels = { booking: 'Reserva', sale: 'Venta', account: 'Cuenta corriente' };
export const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(value);
export const cashDate = (value: string | null) => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '—';
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function cashTotals(session: CashSession, movements: CashMovement[]) {
  const sum = (match: (movement: CashMovement) => boolean) => round(movements.filter(match).reduce((total, movement) => total + Number(movement.amount), 0));
  const receipts = (method: CashMovement['method']) => sum(m => m.method === method && Boolean(m.source_type));
  const manual = sum(m => m.method === 'cash' && !m.source_type);
  return {
    cash: receipts('cash'), card: receipts('card'), transfer: receipts('transfer'), manual,
    expected: round(Number(session.opening_amount) + sum(m => m.method === 'cash')),
    cashIn: sum(m => m.method === 'cash' && m.amount > 0),
    cashOut: -sum(m => m.method === 'cash' && m.amount < 0),
    collected: sum(m => Boolean(m.source_type)),
  };
}

const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (typeof value !== 'number' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function cashCsv(session: CashSession, movements: CashMovement[]) {
  const totals = cashTotals(session, movements);
  const rows: unknown[][] = [
    [complexName, 'Reporte de caja', session.id],
    ['Estado', session.deleted_at ? 'Eliminada' : session.closed_at ? 'Cerrada' : 'Abierta'],
    ['Eliminación', cashDate(session.deleted_at), session.deleted_by_name, session.delete_reason],
    ['Apertura', cashDate(session.opened_at), 'Responsable', session.opened_by_name],
    ['Cierre', cashDate(session.closed_at), 'Responsable', session.closed_by_name],
    ['Efectivo inicial', session.opening_amount], ['Cobros efectivo netos', totals.cash],
    ['Tarjetas netas', totals.card], ['Transferencias netas', totals.transfer],
    ['Ingresos de efectivo', totals.cashIn], ['Egresos de efectivo', totals.cashOut],
    ['Efectivo esperado', session.closed_at ? session.expected_cash : totals.expected],
    ['Efectivo contado', session.counted_cash], ['Diferencia', session.difference],
    ['Fondo reservado', session.retained_cash], ['Efectivo entregado', session.handed_over],
    ['Observaciones apertura', session.opening_notes], ['Observaciones cierre', session.closing_notes], [],
    ['Fecha', 'Responsable', 'Tipo', 'Medio', 'Concepto', 'Importe', 'Origen', 'Referencia', 'Anula movimiento', 'Detalle del origen'],
    ...movements.map(m => [cashDate(m.created_at), m.actor_name, cashKindLabels[m.kind], cashMethodLabels[m.method], m.description, m.amount, m.source_type ? cashSourceLabels[m.source_type] : 'Manual', m.source_id, m.reversal_of, (m.source_detail ?? []).join(' | ')]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function cashReportHtml(session: CashSession, movements: CashMovement[]) {
  const totals = cashTotals(session, movements);
  const rows = cashMovementRows(movements);
  const methods = ['cash', 'card', 'transfer'] as const;
  const columnTotals = methods.map(method => round(movements.filter(m => m.method === method).reduce((sum, m) => sum + Number(m.amount), 0)));
  const grandTotal = round(columnTotals.reduce((sum, amount) => sum + amount, 0));
  const amountCell = (value: number, emptyDash = false) => `<td class="amount${value < 0 ? ' negative' : ''}">${escapeHtml(emptyDash && !value ? '—' : money(value))}</td>`;
  const originDetails = rows.filter(row => row.source_detail?.length).map(row => {
    const source = cashSourceDetails(row.source_detail);
    return `<section class="origin-detail"><strong>${escapeHtml(row.description)} · ${escapeHtml(cashDate(row.created_at))}</strong><p class="reference">Referencia: ${escapeHtml(row.source_id || row.id)}</p>${source.notes.map(line => `<p>${escapeHtml(line)}</p>`).join('')}${source.payments.length ? `<table><thead><tr><th>Jugador</th><th>Medio de pago</th><th class="amount">Importe</th></tr></thead><tbody>${source.payments.map(payment => `<tr><td>${escapeHtml(payment.player)}</td><td>${escapeHtml(payment.method)}</td>${amountCell(payment.amount)}</tr>`).join('')}</tbody></table>` : ''}</section>`;
  }).join('');
  const field = (label: string, value: unknown) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de caja</title><style>
    body{font:12px Arial,sans-serif;color:#17251e;margin:28px}h1{font-size:24px;margin-bottom:6px}h2{font-size:17px;margin-top:24px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{padding:10px;border:1px solid #ddd}.summary span,.summary strong{display:block;margin:5px 0}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px 5px;border-bottom:1px solid #ddd;text-align:left}th{white-space:nowrap;background:#f3f6f4}thead{display:table-header-group}tfoot{display:table-row-group;font-weight:bold;background:#f3f6f4}tfoot td{border-top:2px solid #aaa}tr{break-inside:avoid}.compact{width:1%;white-space:nowrap}.amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.negative{color:#a31818}small{color:#555}.origin-detail{break-inside:avoid;border:1px solid #ddd;padding:12px;margin:10px 0;overflow-wrap:anywhere}.origin-detail p{margin:5px 0}.reference{font-size:10px;color:#555;overflow-wrap:anywhere}@media print{button{display:none}body{margin:0}th,tfoot{print-color-adjust:exact}@page{size:A4 landscape;margin:12mm}}
    </style></head><body><button onclick="window.print()">Imprimir / Guardar PDF</button><h1>${escapeHtml(complexName)} · Caja ${session.deleted_at ? 'eliminada' : session.closed_at ? 'cerrada' : 'abierta'}</h1>
    ${session.deleted_at ? `<p>Eliminada por ${escapeHtml(session.deleted_by_name)} · ${escapeHtml(cashDate(session.deleted_at))} · ${escapeHtml(session.delete_reason)}</p>` : ''}
    <p>Referencia: ${escapeHtml(session.id)}<br>Apertura: ${escapeHtml(cashDate(session.opened_at))} · ${escapeHtml(session.opened_by_name)}<br>Cierre: ${escapeHtml(cashDate(session.closed_at))} · ${escapeHtml(session.closed_by_name)}</p>
    <div class="summary">${field('Fondo de apertura', money(Number(session.opening_amount)))}${field('Cobros netos en efectivo', money(totals.cash))}${field('Tarjetas / Transferencias', `${money(totals.card)} / ${money(totals.transfer)}`)}${field('Ingresos / Egresos de efectivo', `${money(totals.cashIn)} / ${money(totals.cashOut)}`)}${field('Efectivo esperado', money(Number(session.closed_at ? session.expected_cash : totals.expected)))}${field('Efectivo contado', session.closed_at ? money(Number(session.counted_cash)) : 'Pendiente de arqueo')}${field('Diferencia', session.closed_at ? money(Number(session.difference)) : '—')}${field('Efectivo entregado', session.closed_at ? money(Number(session.handed_over)) : '—')}${field('Fondo reservado', session.closed_at ? money(Number(session.retained_cash)) : '—')}</div>
    <p>Apertura: ${escapeHtml(session.opening_notes || 'Sin observaciones')}<br>Cierre: ${escapeHtml(session.closing_notes || 'Sin observaciones')}</p>
    <h2>Movimientos de caja</h2>
    <table><thead><tr><th>Fecha / Responsable</th><th>Tipo / Origen</th><th>Concepto</th>${methods.map(method => `<th class="amount">${cashMethodLabels[method]}</th>`).join('')}<th class="amount">Total</th></tr></thead>
    <tbody>${rows.length ? rows.map(m => `<tr><td class="compact">${escapeHtml(cashDate(m.created_at))} · ${escapeHtml(m.actor_name)}</td><td class="compact">${escapeHtml(cashKindLabels[m.kind])} · ${escapeHtml(m.source_type ? cashSourceLabels[m.source_type] : 'Manual')}</td><td>${escapeHtml(m.description)}<br><small>Ref. ${escapeHtml((m.source_id || m.id).slice(0,8))}</small></td>${methods.map(method => amountCell(m.amounts[method], true)).join('')}${amountCell(round(m.amounts.cash + m.amounts.card + m.amounts.transfer))}</tr>`).join('') : '<tr><td colspan="7">Sin movimientos.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">Totales</td>${columnTotals.map(value => amountCell(value)).join('')}${amountCell(grandTotal)}</tr></tfoot></table>
    <p>Los egresos y ajustes negativos se muestran con signo menos. Se incluyen todos los movimientos de la caja. El fondo inicial no forma parte de los totales de movimientos. Las cuentas corrientes se registran al cobrarse. Tarjetas y transferencias no forman parte del efectivo a rendir.</p>
    ${originDetails ? `<h2>Detalle de los cobros</h2>${originDetails}` : ''}</body></html>`;
}
