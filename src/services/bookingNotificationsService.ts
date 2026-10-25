import { supabase } from '../lib/supabase';

export interface BookingNotification {
  id: string;
  booking_id: string | null;
  kind: 'created' | 'cancelled';
  player_name: string;
  court_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  is_read: boolean;
}

export type NotificationCursor = { created_at: string; id: string };

export const bookingNotificationsService = {
  async getById(id: string): Promise<BookingNotification | null> {
    const { data, error } = await supabase.from('booking_notifications').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { ...data, is_read: false } : null;
  },
  async list(cursor: NotificationCursor | null = null): Promise<{ items: BookingNotification[]; unreadCount: number; hasMore: boolean }> {
    const { data, error } = await supabase.rpc('booking_notification_feed', {
      before_at: cursor?.created_at ?? null, before_id: cursor?.id ?? null,
    });
    if (error) throw error;
    return { items: data.items.slice(0, 30), unreadCount: data.unreadCount, hasMore: data.items.length > 30 };
  },
  async markRead(target: string | null, through?: string) {
    const { error } = await supabase.rpc('mark_booking_notifications_read', {
      target, ...(through ? { through } : {}),
    });
    if (error) throw error;
  },
};
