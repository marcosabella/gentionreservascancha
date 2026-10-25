import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Booking } from '../types';
import BookingDetailContent from './BookingDetailContent';

const statusLabels: Record<string, string> = { confirmed: 'Confirmada', pending: 'Pendiente', 'in-progress': 'En progreso', completed: 'Completada', cancelled: 'Cancelada' };

export default function PlayerBookingReminder({ bookings, playerId }: { bookings: Booking[]; playerId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const booking = bookings.find(item => item.id === selectedId && item.players.some(player => player.id === playerId));
  useEffect(() => {
    const open = () => {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('bookingReminder');
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
      setSelectedId(id);
      if (!dialog.current?.open) dialog.current?.showModal();
      url.searchParams.delete('bookingReminder');
      window.history.replaceState(window.history.state, '', url);
    };
    open();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_PLAYER_BOOKING_REMINDER') open();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => { navigator.serviceWorker?.removeEventListener('message', onMessage); };
  }, [playerId]);
  return <dialog ref={dialog} onClose={() => setSelectedId(null)} aria-labelledby="player-reminder-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/50">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 id="player-reminder-title" className="text-lg font-semibold">Recordatorio de tu turno</h2><button type="button" aria-label="Cerrar recordatorio" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
    {booking ? <BookingDetailContent booking={booking} getStatusText={status => statusLabels[status] ?? status} /> : <p className="text-sm text-gray-600">Esta reserva ya no está disponible en tu cuenta.</p>}
  </dialog>;
}
