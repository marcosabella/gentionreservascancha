import type { Booking, PaymentMethod } from '../types';
import type { Database } from '../lib/supabase';

type Tables = Database['public']['Tables'];
type BookingRow = Tables['bookings']['Row'] & {
  booking_players?: Tables['booking_players']['Row'][];
  booking_consumptions?: Tables['booking_consumptions']['Row'][];
};

export function bookingFromRow(row: BookingRow): Booking {
  return {
    id: row.id, courtId: row.court_id ?? '', courtName: row.court_name,
    date: row.date, startTime: row.start_time, endTime: row.end_time,
    totalPrice: row.total_price, finalTotal: row.final_total ?? undefined,
    status: row.status as Booking['status'], isRecurring: row.is_recurring,
    recurringBookingId: row.recurring_booking_id ?? undefined,
    closedAt: row.closed_at ?? undefined, createdAt: row.created_at,
    players: [...(row.booking_players ?? [])].sort((a, b) => Number(b.is_organizer) - Number(a.is_organizer)).map(player => ({
      id: player.player_id, name: player.player_name, email: player.player_email,
      phone: player.player_phone, isOrganizer: player.is_organizer,
      paymentMethod: player.payment_method as PaymentMethod | undefined,
      paymentSplits: player.payment_splits ?? undefined,
    })),
    consumptions: (row.booking_consumptions ?? []).map(item => ({
      id: item.id, consumableId: item.consumable_id, name: item.name,
      price: item.price, quantity: item.quantity, category: item.category as Booking['consumptions'][number]['category'],
      splitBetweenPlayers: item.split_between_players, assignedToPlayers: item.assigned_to_players,
    })),
  };
}
