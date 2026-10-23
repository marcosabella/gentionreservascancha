import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { bookingNotificationsService } from '../services/bookingNotificationsService';
import type { BookingNotification, NotificationCursor } from '../services/bookingNotificationsService';

export function useBookingNotifications(userId: string) {
  const [items, setItems] = useState<BookingNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<NotificationCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const result = await bookingNotificationsService.list(cursor);
      if (current !== request.current) return;
      setItems(result.items);
      setUnreadCount(result.unreadCount);
      setHasMore(result.hasMore);
      setError(null);
    } catch {
      if (current === request.current) setError('No se pudieron actualizar las notificaciones.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    if (!supabase) { setError('No hay conexión con el complejo.'); setLoading(false); return; }
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const channel = supabase.channel(`booking-notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_notifications' }, update)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_notification_reads', filter: `user_id=eq.${userId}` }, update)
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
    // Also recover after a suspended mobile browser or a dropped realtime connection.
    const interval = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      request.current++;
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [userId, refresh]);

  const markRead = async (target: string | null) => {
    try {
      // Use the database clock, including when the administrator's device is skewed.
      await bookingNotificationsService.markRead(target);
      await refresh();
    } catch {
      setError('No se pudo marcar la notificación como leída. Volvé a intentar.');
    }
  };

  return { items, unreadCount, hasMore, loading, error, refresh, markRead, cursor,
    showRecent: () => setCursor(null),
    showOlder: () => { if (items.length) setCursor(items[items.length - 1]); },
  };
}
