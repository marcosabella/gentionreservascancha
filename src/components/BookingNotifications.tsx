import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, CalendarPlus, CalendarX, CheckCheck, ChevronRight, RefreshCw, X } from 'lucide-react';
import type { Booking } from '../types';
import type { BookingNotification } from '../services/bookingNotificationsService';
import { useBookingNotifications } from '../hooks/useBookingNotifications';
import { bookingsService } from '../services/supabaseService';
import { formatDate } from '../utils/timeSlots';
import BookingDetailContent from './BookingDetailContent';
import { bookingNotificationsService } from '../services/bookingNotificationsService';

const statusLabels: Record<Booking['status'], string> = {
  confirmed: 'Confirmada', pending: 'Pendiente', 'in-progress': 'En progreso', completed: 'Completada', cancelled: 'Cancelada',
};
const eventDate = (value: string) => new Date(value).toLocaleString('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function BookingNotifications({ userId }: { userId: string }) {
  const feed = useBookingNotifications(userId);
  const refreshNotifications = feed.refresh;
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<BookingNotification | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(() => new Set());
  const [linkError, setLinkError] = useState<string | null>(null);
  const pendingNotices = feed.recentItems.filter(item => !item.is_read && !dismissedNotices.has(item.id));
  const notice = pendingNotices[0];

  useEffect(() => {
    let disposed = false;
    const openPush = async (id: string) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return;
      try {
        const notification = await bookingNotificationsService.getById(id);
        if (disposed) return;
        if (!notification) { setLinkError('Este aviso ya no está disponible.'); dialog.current?.showModal(); return; }
        setSelected(notification);
        if (!dialog.current?.open) dialog.current?.showModal();
        setLinkError(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('bookingNotice');
        window.history.replaceState(window.history.state, '', url);
        await bookingNotificationsService.markRead(notification.id);
        if (!disposed) await refreshNotifications();
      } catch { if (!disposed) setLinkError('No se pudo abrir el aviso. Volvé a intentar desde la campana.'); }
    };
    const id = new URL(window.location.href).searchParams.get('bookingNotice');
    if (id) void openPush(id);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_BOOKING_NOTIFICATION' && typeof event.data.id === 'string') void openPush(event.data.id);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => { disposed = true; navigator.serviceWorker?.removeEventListener('message', onMessage); };
  }, [userId, refreshNotifications]);

  useEffect(() => {
    let disposed = false;
    setBooking(null);
    setDetailError(null);
    if (!selected?.booking_id) { setDetailLoading(false); return; }
    setDetailLoading(true);
    bookingsService.getById(selected.booking_id).then(result => {
      if (!disposed) setBooking(result);
    }).catch(() => {
      if (!disposed) setDetailError('No se pudo cargar el estado actual de la reserva.');
    }).finally(() => { if (!disposed) setDetailLoading(false); });
    return () => { disposed = true; };
  }, [selected, retry]);

  const openNotification = (notification: BookingNotification) => {
    setSelected(notification);
    if (!notification.is_read) void feed.markRead(notification.id);
  };

  return <>
    {notice && <aside role="status" aria-live="polite" aria-label="Aviso de reserva de un jugador"
      className="fixed left-4 right-4 top-4 z-[70] rounded-xl border border-green-200 bg-white p-4 text-left shadow-xl sm:left-auto sm:w-96">
      <div className="flex items-start gap-3">
        {notice.kind === 'created'
          ? <CalendarPlus className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          : <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-gray-900">{notice.kind === 'created' ? 'Nueva reserva de un jugador' : 'Un jugador canceló su reserva'}</p>
          <p className="mt-1 break-words text-gray-600">{notice.player_name} · {notice.court_name}</p>
          <p className="mt-1 text-gray-600">{notice.booking_date.split('-').reverse().join('/')} · {notice.start_time.slice(0, 5)} a {notice.end_time.slice(0, 5)}</p>
          {pendingNotices.length > 1 && <p className="mt-1 text-gray-600">Hay más avisos de reservas pendientes.</p>}
          <button type="button" onClick={() => {
            setDismissedNotices(previous => new Set([...previous, notice.id]));
            openNotification(notice);
            dialog.current?.showModal();
          }} className="mt-3 min-h-10 rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700">Ver detalle</button>
        </div>
        <button type="button" aria-label="Cerrar aviso de reserva" onClick={() => {
          setDismissedNotices(previous => new Set([...previous, ...pendingNotices.map(item => item.id)]));
        }} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
    </aside>}
    <div className="flex flex-wrap items-start justify-end gap-2">
    <button type="button" onClick={() => { dialog.current?.showModal(); void feed.refresh(); }}
      aria-label={`Notificaciones de reservas${feed.unreadCount ? `: ${feed.unreadCount} sin leer` : ''}`}
      aria-haspopup="dialog" className="relative inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-green-600">
      <Bell className="h-5 w-5" />
      <span>Notificaciones</span>
      {feed.unreadCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{feed.unreadCount > 99 ? '99+' : feed.unreadCount}</span>}
      {feed.error && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="No se pudieron actualizar" />}
    </button>
    </div>
    {linkError && <p role="alert" className="text-sm text-red-700">{linkError}</p>}

    <dialog ref={dialog} onClose={() => setSelected(null)} aria-labelledby="booking-notifications-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-4 text-gray-900 shadow-2xl backdrop:bg-black/50 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="booking-notifications-title" className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5 text-green-600" />{selected ? 'Detalle de la notificación' : 'Notificaciones de reservas'}</h2>
        <button type="button" aria-label="Cerrar notificaciones" onClick={() => dialog.current?.close()} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </div>

      {selected ? <>
        <button type="button" onClick={() => setSelected(null)} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-blue-700"><ArrowLeft className="h-4 w-4" />Volver a las notificaciones</button>
        <div className={`mb-4 space-y-1 rounded-lg border p-4 text-sm ${selected.kind === 'created' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <p className="font-semibold">{selected.player_name} {selected.kind === 'created' ? 'realizó una reserva' : 'canceló una reserva'}</p>
          <p>{selected.court_name} · {formatDate(selected.booking_date)}</p>
          <p>{selected.start_time.slice(0, 5)} a {selected.end_time.slice(0, 5)}</p>
          <p className="pt-1 text-xs text-gray-500">Aviso registrado el {eventDate(selected.created_at)}</p>
        </div>
        {detailLoading ? <p role="status" className="py-4 text-sm text-gray-500">Cargando reserva…</p>
          : detailError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{detailError}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="rounded border px-3 py-2">Reintentar</button></div>
          : booking ? <div className="rounded-lg border border-gray-200 p-3"><p className="mb-3 text-sm font-semibold">Estado actual de la reserva</p><BookingDetailContent booking={booking} getStatusText={status => statusLabels[status as Booking['status']] ?? status} /></div>
          : <p className="text-sm text-gray-500">La reserva ya no está disponible. Se conserva la información del aviso.</p>}
      </> : <>
        <p className="mb-4 text-sm text-gray-500">Reservas y cancelaciones realizadas por jugadores desde la app.</p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span aria-live="polite" className="text-gray-600">{feed.unreadCount} sin leer</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => void feed.refresh()} disabled={feed.loading} aria-label="Actualizar notificaciones" className="rounded-lg border p-2 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${feed.loading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={() => void feed.markRead(null)} disabled={!feed.unreadCount} className="inline-flex items-center gap-1 rounded-lg border px-2 py-2 text-green-700 disabled:opacity-50"><CheckCheck className="h-4 w-4" />Marcar todas como leídas</button>
          </div>
        </div>
        {feed.error && <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{feed.error}</p>}
        {!feed.items.length ? <p role="status" className="py-10 text-center text-gray-500">{feed.loading ? 'Cargando notificaciones…' : feed.error ? 'Actualizá para volver a intentar.' : 'No hay notificaciones de reservas.'}</p>
          : <div className="space-y-2">{feed.items.map(notification => {
            const Icon = notification.kind === 'created' ? CalendarPlus : CalendarX;
            return <button key={notification.id} type="button" onClick={() => openNotification(notification)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-gray-50 ${notification.is_read ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
              <Icon className={`mt-1 h-5 w-5 shrink-0 ${notification.kind === 'created' ? 'text-green-600' : 'text-red-600'}`} />
              <span className="min-w-0 flex-1 space-y-1 text-sm">
                <span className="block font-semibold">{notification.kind === 'created' ? 'Nueva reserva' : 'Reserva cancelada'}{!notification.is_read && <span className="ml-2 text-xs font-medium text-blue-700">Sin leer</span>}</span>
                <span className="block break-words text-gray-700">{notification.player_name} · {notification.court_name}</span>
                <span className="block text-gray-600">{notification.booking_date.split('-').reverse().join('/')} · {notification.start_time.slice(0, 5)} a {notification.end_time.slice(0, 5)}</span>
                <span className="block text-xs text-gray-500">{eventDate(notification.created_at)}</span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
            </button>;
          })}</div>}
        <div className="mt-4 flex justify-between gap-3 text-sm">
          {feed.cursor ? <button type="button" onClick={feed.showRecent} className="rounded-lg border px-3 py-2 text-blue-700">Ver más recientes</button> : <span />}
          {feed.hasMore && <button type="button" onClick={feed.showOlder} disabled={feed.loading} className="rounded-lg border px-3 py-2 text-blue-700 disabled:opacity-50">Ver anteriores</button>}
        </div>
      </>}
    </dialog>
  </>;
}
