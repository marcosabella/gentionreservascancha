import type { CashMovement, CashSession } from '../types/cash';
import { complexName } from '../config/complex';

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
    ['Fecha', 'Responsable', 'Tipo', 'Medio', 'Concepto', 'Importe', 'Origen', 'Referencia', 'Anula movimiento'],
    ...movements.map(m => [cashDate(m.created_at), m.actor_name, cashKindLabels[m.kind], cashMethodLabels[m.method], m.description, m.amount, m.source_type ? cashSourceLabels[m.source_type] : 'Manual', m.source_id, m.reversal_of]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function cashReportHtml(session: CashSession, movements: CashMovement[]) {
  const totals = cashTotals(session, movements);
  const field = (label: string, value: unknown) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de caja</title><style>
    body{font:13px Arial,sans-serif;color:#17251e;margin:28px}h1{font-size:24px;margin-bottom:6px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}.summary div{padding:12px;border:1px solid #ddd}.summary span,.summary strong{display:block;margin:5px 0}table{width:100%;border-collapse:collapse}th,td{padding:8px 5px;border-bottom:1px solid #ddd;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.amount{text-align:right}small{color:#555}@media print{button{display:none}body{margin:0}@page{size:A4 landscape;margin:12mm}}
    </style></head><body><button onclick="window.print()">Imprimir / Guardar PDF</button><h1>${escapeHtml(complexName)} · Caja ${session.deleted_at ? 'eliminada' : session.closed_at ? 'cerrada' : 'abierta'}</h1>
    ${session.deleted_at ? `<p>Eliminada por ${escapeHtml(session.deleted_by_name)} · ${escapeHtml(cashDate(session.deleted_at))} · ${escapeHtml(session.delete_reason)}</p>` : ''}
    <p>Referencia: ${escapeHtml(session.id)}<br>Apertura: ${escapeHtml(cashDate(session.opened_at))} · ${escapeHtml(session.opened_by_name)}<br>Cierre: ${escapeHtml(cashDate(session.closed_at))} · ${escapeHtml(session.closed_by_name)}</p>
    <div class="summary">${field('Fondo de apertura', money(Number(session.opening_amount)))}${field('Cobros netos en efectivo', money(totals.cash))}${field('Tarjetas / Transferencias', `${money(totals.card)} / ${money(totals.transfer)}`)}${field('Ingresos / Egresos de efectivo', `${money(totals.cashIn)} / ${money(totals.cashOut)}`)}${field('Efectivo esperado', money(Number(session.closed_at ? session.expected_cash : totals.expected)))}${field('Efectivo contado', session.closed_at ? money(Number(session.counted_cash)) : 'Pendiente de arqueo')}${field('Diferencia', session.closed_at ? money(Number(session.difference)) : '—')}${field('Efectivo entregado', session.closed_at ? money(Number(session.handed_over)) : '—')}${field('Fondo reservado', session.closed_at ? money(Number(session.retained_cash)) : '—')}</div>
    <p>Apertura: ${escapeHtml(session.opening_notes || 'Sin observaciones')}<br>Cierre: ${escapeHtml(session.closing_notes || 'Sin observaciones')}</p>
    <table><thead><tr><th>Fecha</th><th>Responsable</th><th>Tipo / Origen</th><th>Concepto / Referencia</th><th>Medio</th><th>Importe</th></tr></thead><tbody>${movements.map(m => `<tr><td>${escapeHtml(cashDate(m.created_at))}</td><td>${escapeHtml(m.actor_name)}</td><td>${escapeHtml(cashKindLabels[m.kind])}<br>${escapeHtml(m.source_type ? cashSourceLabels[m.source_type] : 'Manual')}</td><td>${escapeHtml(m.description)}<br><small>${escapeHtml(m.source_id || m.id)}</small></td><td>${escapeHtml(cashMethodLabels[m.method])}</td><td class="amount">${escapeHtml(money(Number(m.amount)))}</td></tr>`).join('')}</tbody></table><p>El fondo inicial no es una venta. Las cuentas corrientes se registran al cobrarse. Tarjetas y transferencias no forman parte del efectivo a rendir.</p></body></html>`;
}
