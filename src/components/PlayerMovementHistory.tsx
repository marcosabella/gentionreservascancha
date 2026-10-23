import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { PlayerMovement } from '../utils/playerMovements';
import { salesPaymentMethods } from '../utils/salesReport';
import { formatCurrency, formatDate } from '../utils/timeSlots';

const paymentLabel = (method?: string) => salesPaymentMethods.find(p => p.id === method)?.label ?? 'Sin medio registrado';
const shortDate = (date: string) => date.split('-').reverse().join('/');

export default function PlayerMovementHistory({ movements }: { movements: PlayerMovement[] }) {
  const [selected, setSelected] = useState<PlayerMovement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);

  const closeDetail = () => {
    dialog.current?.close();
    setSelected(null);
  };

  if (!movements.length) return <p className="py-8 text-center text-gray-500">No hay movimientos registrados</p>;

  return <>
    <p className="mb-3 text-sm text-gray-500">Tocá un movimiento para ver su detalle. Los pagos al contado figuran en el Haber; el saldo corresponde a tu cuenta corriente.</p>
    <div className="min-w-0 rounded-lg border border-gray-200 md:hidden">
      <div className="grid grid-cols-3 gap-2 rounded-t-lg bg-gray-100 px-3 py-2 text-right text-xs font-semibold text-gray-700">
        <span>Debe</span><span>Haber</span><span>Saldo</span>
      </div>
      <div className="divide-y divide-gray-200">
        {movements.map(movement => <button key={movement.id} type="button" onClick={() => setSelected(movement)}
          aria-label={`Ver detalle: ${movement.title}, ${shortDate(movement.date)}`}
          aria-describedby={`player-movement-amounts-${movement.id}`}
          className="block w-full min-w-0 px-3 py-3 text-left hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{movement.title}</span>
            <span className="shrink-0 text-xs text-gray-500">{shortDate(movement.date)}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
          </span>
          <span id={`player-movement-amounts-${movement.id}`} className="mt-2 grid min-w-0 grid-cols-3 gap-2 text-right text-xs tabular-nums [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]">
            <span className="text-red-600"><span className="sr-only">Debe: </span>{movement.debit ? formatCurrency(movement.debit) : '—'}</span>
            <span className="text-green-700"><span className="sr-only">Haber: </span>{movement.paid ? formatCurrency(movement.paid) : '—'}</span>
            <span className={`font-semibold ${movement.balance < 0 ? 'text-red-600' : movement.balance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
              <span className="sr-only">Saldo: </span>{formatCurrency(Math.abs(movement.balance))}
              <span className="mt-0.5 block text-xs font-normal text-gray-500">{movement.balance < 0 ? 'Debe' : movement.balance > 0 ? 'A favor' : 'Sin saldo'}</span>
            </span>
          </span>
        </button>)}
      </div>
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
      <table className="w-full text-xs md:text-sm">
        <thead className="bg-gray-100 text-left text-gray-700">
          <tr>
            <th className="hidden p-3 md:table-cell">Fecha</th>
            <th className="p-2 md:p-3">Movimiento</th>
            <th className="p-2 text-right md:p-3">Debe</th>
            <th className="p-2 text-right md:p-3">Haber</th>
            <th className="p-2 text-right md:p-3">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {movements.map(movement => <tr key={movement.id} onClick={() => setSelected(movement)} className="cursor-pointer hover:bg-blue-50 focus-within:bg-blue-50">
            <td className="hidden whitespace-nowrap p-3 md:table-cell">{shortDate(movement.date)}<div className="text-xs text-gray-500">{movement.time.slice(0, 5)}</div></td>
            <td className="p-2 md:p-3">
              <button type="button" onClick={event => { event.stopPropagation(); setSelected(movement); }} className="flex w-full items-center gap-1 text-left font-medium text-gray-900" aria-label={`Ver detalle: ${movement.title}, ${shortDate(movement.date)}`}>
                <span className="max-w-24 truncate md:max-w-none">{movement.title}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
              </button>
              <div className="mt-1 text-[10px] text-gray-500 md:hidden">{shortDate(movement.date)}</div>
            </td>
            <td className="whitespace-nowrap p-2 text-right text-red-600 md:p-3">{movement.debit ? formatCurrency(movement.debit) : '—'}</td>
            <td className="whitespace-nowrap p-2 text-right text-green-700 md:p-3">{movement.paid ? formatCurrency(movement.paid) : '—'}</td>
            <td className={`whitespace-nowrap p-2 text-right font-semibold md:p-3 ${movement.balance < 0 ? 'text-red-600' : movement.balance > 0 ? 'text-green-700' : 'text-gray-600'}`}>
              {formatCurrency(Math.abs(movement.balance))}
              <div className="text-[10px] font-normal text-gray-500">{movement.balance < 0 ? 'Debe' : movement.balance > 0 ? 'A favor' : 'Sin saldo'}</div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <dialog ref={dialog} onCancel={closeDetail} onClose={() => setSelected(null)} aria-labelledby="player-movement-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/50">
      {selected && <>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 id="player-movement-title" className="text-lg font-semibold text-gray-900">{selected.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{formatDate(selected.date)} · {selected.time.slice(0, 5)}</p>
          </div>
          <button type="button" onClick={closeDetail} aria-label="Cerrar detalle" className="shrink-0 rounded p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 text-sm text-gray-700">
          {selected.items.length > 0 && <div className="space-y-2">{selected.items.map((item, i) => <div key={i} className="flex justify-between gap-3"><span>{item.name}</span><span className="shrink-0">{formatCurrency(item.amount)}</span></div>)}</div>}
          <div className="space-y-2 border-t pt-3">
            <p className="font-medium">Medios de pago</p>
            {selected.payments.map((payment, i) => <div key={i} className="flex justify-between gap-3"><span>{paymentLabel(payment.method)}</span><span className="shrink-0">{formatCurrency(payment.amount)}</span></div>)}
          </div>
          {selected.notes && <p className="whitespace-pre-wrap break-words">{selected.notes}</p>}
          <p className="flex justify-between gap-3 border-t pt-3 font-semibold"><span>{selected.credit ? 'Pago de cuenta corriente' : 'Total de tu movimiento'}</span><span>{formatCurrency(selected.amount)}</span></p>
          <p className="flex justify-between gap-3"><span>Saldo después del movimiento</span><span>{formatCurrency(Math.abs(selected.balance))} · {selected.balance < 0 ? 'Debe' : selected.balance > 0 ? 'A favor' : 'Sin saldo'}</span></p>
        </div>
        <button type="button" onClick={closeDetail} className="mt-5 w-full rounded-lg bg-gray-100 px-4 py-3 font-medium text-gray-700 hover:bg-gray-200">Volver al historial</button>
      </>}
    </dialog>
  </>;
}
