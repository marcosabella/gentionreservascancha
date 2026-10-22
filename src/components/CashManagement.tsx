import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Banknote, RefreshCw, Download, Printer, LockKeyhole, Plus, X, Eye } from 'lucide-react';
import CashMovementDetail from './CashMovementDetail';
import { cashMovementRows } from '../utils/cashRows';
import type { CashMovementRow } from '../utils/cashRows';
import type { AuthUser } from '../types';
import type { CashMovement, CashSession, CashAudit } from '../types/cash';
import { cashService } from '../services/cashService';
import { hasPermission } from '../config/permissions';
import { cashDate, cashTotals, cashCsv, cashReportHtml, cashMethodLabels, cashKindLabels, cashSourceLabels, money } from '../utils/cash';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const denominations = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10];
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'No se pudo completar la operación';
const localDay = (date: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(date));

export default function CashManagement({ user }: { user: AuthUser }) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [detail, setDetail] = useState<CashMovementRow | null>(null);
  const [audit, setAudit] = useState<CashAudit[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState<'open' | 'move' | 'close' | 'reverse' | 'edit' | 'delete' | 'reopen' | null>(null);
  const [openingNotes, setOpeningNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState('expense');
  const [retained, setRetained] = useState('0');
  const [reverseId, setReverseId] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [method, setMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const selectedRef = useRef('');
  const requestRef = useRef(0);
  const can = (permission: string) => hasPermission(user, `cash.${permission}`);

  const refresh = useCallback(async (preferredId?: string) => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await cashService.sessions();
      const preferred = preferredId ?? selectedRef.current;
      const selected = next.find(s => s.id === preferred) ?? next.find(s => !s.closed_at && !s.deleted_at) ?? next.find(s => !s.deleted_at);
      const [entries, changes] = selected ? await Promise.all([cashService.movements(selected.id), cashService.audit(selected.id)]) : [[], []];
      if (request !== requestRef.current) return;
      setSessions(next); setSelectedId(selected?.id ?? ''); selectedRef.current = selected?.id ?? '';
      setMovements(entries); setAudit(changes); setError('');
    } catch (caught) { if (request === requestRef.current) setError(message(caught)); }
    finally { if (request === requestRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const request = requestRef;
    void refresh();
    return () => { request.current++; };
  }, [refresh, user.id, user.permissions]);
  useEffect(() => {
    const update = () => { if (!modal && !pending && document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh, modal, pending]);

  const selected = sessions.find(s => s.id === selectedId);
  const open = sessions.find(s => !s.closed_at && !s.deleted_at);
  const totals = selected ? cashTotals(selected, movements) : null;
  const reversed = new Set(movements.map(m => m.reversal_of).filter(Boolean));
  const history = sessions.filter(s => (showDeleted || !s.deleted_at) && (!from || localDay(s.opened_at) >= from) && (!to || localDay(s.opened_at) <= to));
  const visible = cashMovementRows(movements).filter(m => (method === 'all' || m.entries.some(entry => entry.method === method)) &&
    `${m.description} ${(m.source_detail ?? []).join(' ')} ${m.actor_name} ${m.source_id ?? ''} ${m.source_type ? cashSourceLabels[m.source_type] : 'Manual'}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const visibleTotals = visible.reduce((totals, row) => ({
    cash: totals.cash + row.amounts.cash,
    card: totals.card + row.amounts.card,
    transfer: totals.transfer + row.amounts.transfer,
  }), { cash: 0, card: 0, transfer: 0 });

  const showModal = (type: typeof modal, movement?: CashMovement) => {
    setAmount(''); setNotes(''); setRetained('0'); setCounts({}); setError(''); setSuccess('');
    if (type === 'edit') { setAmount(String(selected?.opening_amount ?? 0)); setOpeningNotes(selected?.opening_notes ?? ''); }
    setReverseId(movement?.id ?? ''); setModal(type);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(''); setSuccess('');
    try {
      const payload: Record<string, unknown> = { sessionId: selected?.id, notes: notes.trim() };
      if (modal === 'open' || modal === 'move' || modal === 'edit') payload.amount = Number(amount);
      if (modal === 'edit') payload.openingNotes = openingNotes;
      if (modal === 'move') payload.kind = kind;
      if (modal === 'close') { payload.counted = Number(amount); payload.retained = Number(retained); }
      if (modal === 'reverse') payload.movementId = reverseId;
      const id = await cashService.command(modal!, payload);
      const action = modal;
      setModal(null);
      if (action === 'delete') setShowDeleted(true);
      await refresh(action === 'open' || action === 'close' || action === 'reopen' || action === 'delete' ? id : selected?.id);
      setSuccess(action === 'close' ? 'Caja cerrada. El arqueo y los movimientos quedaron guardados.' : action === 'open' ? 'Caja abierta. Los cobros se registrarán automáticamente.' : action === 'delete' ? 'Caja eliminada. Se conservó el historial para auditoría.' : action === 'reopen' ? 'Caja reabierta. Ya puede recibir nuevos movimientos.' : action === 'edit' ? 'Caja modificada. El cambio quedó registrado en auditoría.' : 'Movimiento registrado.');
    } catch (caught) { setError(message(caught)); }
    finally { setPending(false); }
  };

  const exportCsv = () => {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([cashCsv(selected, movements)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `caja-${localDay(selected.opened_at)}-${selected.id.slice(0, 8)}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!selected) return;
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { setError('Permití abrir ventanas para imprimir el reporte.'); return; }
    popup.opener = null; popup.document.write(cashReportHtml(selected, movements)); popup.document.close();
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Banknote className="h-7 w-7 text-green-600" /> Caja</h1><p className="mt-1 text-sm text-gray-600">Apertura, cobros, movimientos y rendición del efectivo.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={`${buttonClass} border bg-white`} disabled={loading || pending} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button>
        {!open && can('open') && <button disabled={loading || pending || Boolean(error)} className={`${buttonClass} bg-green-600 text-white`} onClick={() => showModal('open')}><Plus className="h-4 w-4" /> Abrir caja</button>}
        {open && selected?.id !== open.id && <button className={`${buttonClass} bg-green-100 text-green-800`} onClick={() => void refresh(open.id)}>Ir a caja abierta</button>}
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
    {success && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">{success}</div>}
    {!open && !loading && !error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">No hay una caja abierta. Para registrar cobros en efectivo, tarjeta o transferencia, primero abrí la caja con el fondo inicial disponible.</div>}
    {(can('report') || can('edit') || can('delete') || can('reopen')) && <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold text-gray-900">Historial de cajas</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
        <label className="text-sm">Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Hasta<input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Seleccionar caja<select value={history.some(s => s.id === selectedId) ? selectedId : ''} disabled={pending || loading} onChange={e => void refresh(e.target.value)} className={inputClass}>
          <option value="" disabled>{history.length ? 'Seleccioná una caja' : 'Sin cajas en este período'}</option>
          {history.map(s => <option key={s.id} value={s.id}>{s.deleted_at ? 'Eliminada' : s.closed_at ? 'Cerrada' : 'Abierta'} · {cashDate(s.opened_at)} · {s.opened_by_name}{s.closed_at ? ` · diferencia ${money(Number(s.difference))}` : ''}</option>)}
        </select></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Mostrar cajas eliminadas</label>
    </section>}
    {selected && totals && <>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Caja del {cashDate(selected.opened_at)}</h2><span className={`rounded-full px-2 py-1 text-xs font-medium ${selected.closed_at ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-800'}`}>{selected.deleted_at ? 'Eliminada' : selected.closed_at ? 'Cerrada' : 'Abierta'}</span></div>
            <p className="mt-1 text-sm text-gray-600">Abrió {selected.opened_by_name}{selected.closed_at ? ` · Cerró ${selected.closed_by_name} · ${cashDate(selected.closed_at)}` : ''}</p>
            {selected.opening_notes && <p className="mt-1 text-sm text-gray-500">Apertura: {selected.opening_notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!selected.deleted_at && can('edit') && <button disabled={loading || pending} className={`${buttonClass} border`} onClick={() => showModal('edit')}>Modificar caja</button>}
            {!selected.deleted_at && can('delete') && <button disabled={loading || pending} className={`${buttonClass} border border-red-200 text-red-700`} onClick={() => showModal('delete')}>Eliminar caja</button>}
            {(selected.closed_at || selected.deleted_at) && can('reopen') && <button disabled={loading || pending || Boolean(open)} className={`${buttonClass} bg-amber-100 text-amber-900`} onClick={() => showModal('reopen')}>{selected.deleted_at ? 'Restaurar y reabrir' : 'Reabrir caja'}</button>}
            {can('report') && <><button disabled={loading || pending} className={`${buttonClass} border`} onClick={exportCsv}><Download className="h-4 w-4" /> CSV</button><button disabled={loading || pending} className={`${buttonClass} border`} onClick={print}><Printer className="h-4 w-4" /> Reporte</button></>}
            {!selected.closed_at && !selected.deleted_at && can('move') && <button disabled={loading || pending} className={`${buttonClass} bg-blue-600 text-white`} onClick={() => showModal('move')}><Plus className="h-4 w-4" /> Movimiento</button>}
            {!selected.closed_at && !selected.deleted_at && can('close') && <button disabled={loading || pending} className={`${buttonClass} bg-gray-800 text-white`} onClick={() => showModal('close')}><LockKeyhole className="h-4 w-4" /> Arqueo y cierre</button>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Fondo de apertura', Number(selected.opening_amount), 'bg-gray-50'], ['Cobros netos en efectivo', totals.cash, 'bg-green-50'], ['Egresos de efectivo', totals.cashOut, 'bg-red-50'], ['Efectivo a rendir', selected.closed_at ? Number(selected.expected_cash) : totals.expected, 'bg-green-100'], ['Cobros netos con tarjeta', totals.card, 'bg-blue-50'], ['Cobros netos por transferencia', totals.transfer, 'bg-blue-50'], ['Ingresos de efectivo', totals.cashIn, 'bg-gray-50'], ['Total de cobros netos', totals.collected, 'bg-gray-50']].map(([label, value, background]) => <div key={String(label)} className={`rounded-lg p-4 ${background}`}><p className="text-sm text-gray-600">{label}</p><p className="mt-1 text-xl font-bold">{money(Number(value))}</p></div>)}
        </div>
        <p className="mt-3 text-xs text-gray-500">Efectivo a rendir = fondo inicial + ingresos en efectivo − egresos en efectivo. Incluye ajustes y anulaciones. Tarjetas y transferencias se informan por separado.</p>
        {selected.deleted_at && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Caja eliminada por {selected.deleted_by_name} el {cashDate(selected.deleted_at)}. Motivo: {selected.delete_reason}. Sus cobros se conservan y no se vuelven a contabilizar.</p>}
        {selected.closed_at && <div className="mt-5 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold">Arqueo guardado</h3><div className="mt-3 grid gap-3 sm:grid-cols-4">{[['Efectivo contado', selected.counted_cash], ['Diferencia', selected.difference], ['Fondo reservado', selected.retained_cash], ['Efectivo entregado', selected.handed_over]].map(([label, value]) => <div key={String(label)}><p className="text-sm text-gray-500">{label}</p><p className="font-semibold">{money(Number(value))}</p></div>)}</div>{selected.closing_notes && <p className="mt-3 text-sm">Observaciones: {selected.closing_notes}</p>}<p className="mt-2 text-xs text-gray-500">El fondo reservado se carga como apertura de la próxima caja cuando se vuelva a abrir.</p></div>}
      </section>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="font-semibold">Movimientos ({movements.length})</h2><div className="flex flex-wrap gap-2"><input aria-label="Buscar movimientos" placeholder="Buscar jugador, cancha o referencia" className={inputClass + ' sm:w-72'} value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filtrar medio de pago" className={inputClass + ' sm:w-44'} value={method} onChange={e => setMethod(e.target.value)}><option value="all">Todos los medios</option>{Object.entries(cashMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>
          <th className="w-px whitespace-nowrap px-3 py-3">Fecha / Responsable</th><th className="w-px whitespace-nowrap px-3 py-3">Tipo / Origen</th><th className="px-3 py-3">Concepto</th>
          {Object.values(cashMethodLabels).map(label => <th key={label} className="w-px whitespace-nowrap px-3 py-3 text-right">{label}</th>)}<th className="w-px whitespace-nowrap px-3 py-3 text-right">Total</th><th className="w-px px-2 py-3"><span className="sr-only">Acciones</span></th>
        </tr></thead><tbody className="divide-y divide-gray-100">
          {!visible.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{loading ? 'Cargando movimientos…' : 'Sin movimientos para mostrar.'}</td></tr>}
          {visible.map(m => <tr key={m.id} className="align-top">
            <td className="w-px whitespace-nowrap px-3 py-3 text-xs">{cashDate(m.created_at)} <span className="text-gray-500">· {m.actor_name}</span></td>
            <td className="w-px whitespace-nowrap px-3 py-3 text-xs">{cashKindLabels[m.kind]} <span className="text-gray-500">· {m.source_type ? cashSourceLabels[m.source_type] : 'Manual'}{m.entries.some(entry => reversed.has(entry.id)) ? ' · anulado' : ''}</span></td>
            <td className="px-3 py-3"><div className="flex items-start gap-2"><p className="min-w-0 break-words">{m.description}</p><button type="button" title="Ver detalle" aria-label={`Ver detalle: ${m.description}`} onClick={() => setDetail(m)} className="shrink-0 rounded-md p-1 text-green-700 hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"><Eye className="h-4 w-4" /></button></div></td>
            {Object.keys(cashMethodLabels).map(key => { const value = m.amounts[key as keyof typeof m.amounts]; return <td key={key} className={`w-px whitespace-nowrap px-3 py-3 text-right tabular-nums ${value < 0 ? 'text-red-600' : value > 0 ? 'text-green-700' : 'text-gray-400'}`}>{value ? money(value) : '—'}</td>; })}
            <td className="w-px whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(m.entries.reduce((total, entry) => total + Number(entry.amount), 0))}</td>
            <td className="w-px px-2 py-3">{!selected.closed_at && !selected.deleted_at && can('adjust') && ['manual_in', 'expense', 'withdrawal'].includes(m.kind) && !reversed.has(m.id) && <button disabled={loading || pending} className="text-xs text-red-700 hover:underline" onClick={() => showModal('reverse', m)}>Anular</button>}</td>
          </tr>)}
        </tbody><tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
          <tr><td colSpan={3} className="px-3 py-4">{method !== 'all' || search ? 'Totales filtrados' : 'Totales'}</td>
            {Object.keys(cashMethodLabels).map(key => <td key={key} className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{money(visibleTotals[key as keyof typeof visibleTotals])}</td>)}
            <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{money(visibleTotals.cash + visibleTotals.card + visibleTotals.transfer)}</td><td />
          </tr>
        </tfoot></table></div>
        <p className="p-4 text-xs text-gray-500">Los cobros se corrigen desde la venta, reserva o pago de origen. Cada corrección deja un movimiento y conserva el historial. Los egresos y ajustes negativos se muestran con signo menos en su medio de pago. El reporte y el CSV incluyen todos los movimientos de la caja.</p>
      </section>
      {can('report') && <section className="rounded-xl border border-gray-200 bg-white p-4"><h2 className="mb-3 font-semibold">Auditoría de la caja</h2>{!audit.length && <p className="text-sm text-gray-500">Sin cambios registrados.</p>}<div className="space-y-3">{audit.map(change => <details key={change.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm"><strong>{({ open: 'Apertura', close: 'Cierre', edit: 'Modificación', delete: 'Eliminación', reopen: 'Reapertura' } as Record<string, string>)[change.action] ?? change.action}</strong> · {cashDate(change.created_at)} · {change.actor_name}{change.reason ? ` · ${change.reason}` : ''}</summary><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['Antes', change.before_data], ['Después', change.after_data]].map(([label, value]) => { const state = value as CashSession | null; return <div key={String(label)} className="rounded-lg bg-gray-50 p-3"><p className="font-semibold">{String(label)}</p>{state ? <><p>Estado: {state.deleted_at ? 'Eliminada' : state.closed_at ? 'Cerrada' : 'Abierta'}</p><p>Apertura: {money(Number(state.opening_amount))}</p><p>Efectivo esperado: {state.expected_cash === null ? '—' : money(Number(state.expected_cash))}</p><p>Contado: {state.counted_cash === null ? '—' : money(Number(state.counted_cash))}</p><p>Diferencia: {state.difference === null ? '—' : money(Number(state.difference))}</p><p>Entregado: {state.handed_over === null ? '—' : money(Number(state.handed_over))}</p><p>Observaciones: {state.opening_notes} {state.closing_notes}</p></> : <p>Sin registro anterior</p>}</div>; })}</div></details>)}</div></section>}
    </>}
    {loading && !selected && <p role="status" className="p-6 text-center text-gray-500">Cargando caja…</p>}
    {detail && <CashMovementDetail row={detail} onClose={() => setDetail(null)} />}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="cash-dialog-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><h2 id="cash-dialog-title" className="text-xl font-semibold">{modal === 'open' ? 'Abrir caja' : modal === 'move' ? 'Movimiento de efectivo' : modal === 'close' ? 'Arqueo y cierre de caja' : modal === 'edit' ? 'Modificar caja' : modal === 'delete' ? 'Eliminar caja' : modal === 'reopen' ? 'Reabrir caja' : 'Anular movimiento manual'}</h2><button type="button" aria-label="Cerrar" disabled={pending} onClick={() => setModal(null)}><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} className="space-y-4">
        {modal === 'open' && <p className="text-sm text-gray-600">Contá el efectivo que hay en caja antes de comenzar. Este fondo no se contabiliza como una venta.</p>}
        {modal === 'edit' && <><p className="text-sm text-gray-600">Podés corregir el fondo inicial y sus observaciones. Si la caja está cerrada, se recalculan el efectivo esperado y la diferencia conservando el importe contado. El cambio queda auditado.</p><label className="block text-sm">Observaciones de apertura<textarea className={inputClass} value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} maxLength={1000} /></label></>}
        {modal === 'delete' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Esta caja quedará eliminada y dejará de estar activa. Sus cobros y su historial se conservarán para auditoría; no se borran las ventas ni se devuelve efectivo. Verificá la rendición antes de confirmar.</p>}
        {modal === 'reopen' && <p className="text-sm text-gray-600">La caja volverá a estar abierta y conservará sus movimientos y el fondo inicial. El cierre anterior quedará en la auditoría. Al terminar deberás realizar un nuevo arqueo.</p>}
        {modal === 'move' && <label className="block text-sm">Tipo de movimiento<select className={inputClass} value={kind} onChange={e => setKind(e.target.value)}><option value="manual_in">Ingreso de efectivo</option><option value="expense">Gasto / egreso</option><option value="withdrawal">Retiro / entrega parcial</option></select></label>}
        {modal === 'close' && <><div className="rounded-lg bg-green-50 p-4"><p className="text-sm">Efectivo esperado</p><p className="text-2xl font-bold">{money(totals?.expected ?? 0)}</p></div><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Ayuda para contar billetes (opcional)</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{denominations.map(value => <label key={value} className="text-xs">{money(value)} ×<input aria-label={`Cantidad de billetes de ${value}`} className={inputClass} type="number" min="0" step="1" value={counts[value] || ''} onChange={e => { const next = { ...counts, [value]: Math.max(0, Math.floor(Number(e.target.value))) }; setCounts(next); setAmount(String(Object.entries(next).reduce((sum, [bill, quantity]) => sum + Number(bill) * Number(quantity), 0))); }} /></label>)}</div><p className="mt-2 text-xs text-gray-500">Podés ajustar el total contado para incluir monedas u otros billetes.</p></details></>}
        {['open', 'move', 'close', 'edit'].includes(modal) && <label className="block text-sm">{modal === 'open' || modal === 'edit' ? 'Monto de apertura en efectivo' : modal === 'close' ? 'Total de efectivo contado' : 'Importe en efectivo'}<input className={inputClass} type="number" required min={modal === 'move' ? '0.01' : '0'} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" autoFocus /></label>}
        {modal === 'close' && <><label className="block text-sm">Fondo que se reserva para la próxima apertura<input className={inputClass} type="number" min="0" max={amount || 0} step="0.01" required value={retained} onChange={e => setRetained(e.target.value)} /></label><div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3"><div><p className="text-sm text-gray-500">Diferencia {Number(amount) < (totals?.expected ?? 0) ? '(faltante)' : Number(amount) > (totals?.expected ?? 0) ? '(sobrante)' : ''}</p><p className={Number(amount) !== totals?.expected ? 'font-semibold text-amber-700' : 'font-semibold text-green-700'}>{amount ? money(Number(amount) - (totals?.expected ?? 0)) : '—'}</p></div><div><p className="text-sm text-gray-500">Efectivo a entregar</p><p className="font-semibold">{amount ? money(Number(amount) - Number(retained)) : '—'}</p></div></div><p className="text-xs text-gray-500">El cierre guarda el arqueo y bloquea nuevos movimientos en esta caja. Confirmá la entrega del efectivo al responsable.</p></>}
        {modal === 'reverse' && <p className="text-sm text-gray-600">Se registrará un movimiento inverso. El original quedará visible en el historial.</p>}
        <label className="block text-sm">{modal === 'move' ? 'Concepto' : modal === 'reverse' ? 'Motivo de la anulación' : 'Observaciones'}<textarea maxLength={1000} className={inputClass} rows={3} value={notes} onChange={e => setNotes(e.target.value)} required={['move', 'reverse', 'edit', 'delete', 'reopen'].includes(modal) || modal === 'close' && Number(amount) !== totals?.expected} /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={pending} className={`${buttonClass} border`} onClick={() => { setModal(null); setError(''); }}>Cancelar</button><button disabled={pending || loading} className={`${buttonClass} bg-green-600 text-white`}>{pending ? 'Guardando…' : modal === 'close' ? 'Confirmar cierre' : modal === 'open' ? 'Confirmar apertura' : modal === 'edit' ? 'Guardar cambios' : modal === 'delete' ? 'Confirmar eliminaci?n' : modal === 'reopen' ? 'Confirmar reapertura' : 'Confirmar movimiento'}</button></div>
      </form>
    </section></div>}
  </div>;
}
