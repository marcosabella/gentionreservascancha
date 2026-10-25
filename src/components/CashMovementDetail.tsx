import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { CashMovementRow } from '../utils/cashRows';
import { cashDate, cashMethodLabels, money } from '../utils/cash';
import { cashSourceDetails } from '../utils/cashSourceDetails';

export default function CashMovementDetail({ row, onClose }: { row: CashMovementRow; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const source = cashSourceDetails(row.source_detail);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    aria-labelledby="cash-detail-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50">
    <div className="flex items-center justify-between border-b p-5">
      <h2 id="cash-detail-title" className="text-xl font-semibold">Detalle del cobro / movimiento</h2>
      <button type="button" autoFocus aria-label="Cerrar detalle" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
    </div>
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="font-semibold">{row.description}</p><p className="text-sm text-gray-500">{cashDate(row.created_at)} · {row.actor_name}</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(cashMethodLabels).map(([method, label]) => <div key={method} className="rounded-lg bg-gray-50 p-3"><p className="text-sm text-gray-500">{label}</p><p className={`mt-1 font-semibold ${row.amounts[method as keyof typeof row.amounts] < 0 ? 'text-red-600' : 'text-gray-900'}`}>{money(row.amounts[method as keyof typeof row.amounts])}</p></div>)}
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-sm text-amber-800">Cuenta Corriente</p><p className="mt-1 font-semibold text-amber-900">{money(row.currentAccount)}</p></div>
      </div>
      <section><h3 className="mb-3 font-semibold">{row.source_type === 'booking' ? 'Detalle de la reserva' : 'Detalle'}</h3>
        <div className="space-y-2">{source.notes.map((line, index) => <p key={index} className="break-words rounded-lg bg-gray-50 p-3 text-sm">{line}</p>)}</div>
        {source.payments.length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr><th className="px-3 py-3">Jugador</th><th className="whitespace-nowrap px-3 py-3">Medio de pago</th><th className="px-3 py-3 text-right">Importe</th></tr></thead><tbody className="divide-y">{source.payments.map((payment, index) => <tr key={index}><td className="px-3 py-3">{payment.player}</td><td className="whitespace-nowrap px-3 py-3">{payment.method}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{money(payment.amount)}</td></tr>)}</tbody></table></div>}
        {!row.source_detail?.length && <p className="text-sm text-gray-500">Sin detalle adicional disponible.</p>}
      </section>
      {row.source_id && <p className="break-all text-xs text-gray-500">Referencia de origen: {row.source_id}</p>}
      <div className="flex justify-end"><button type="button" onClick={() => dialog.current?.close()} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">Cerrar</button></div>
    </div>
  </dialog>;
}
