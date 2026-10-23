import type { Booking, CurrentAccountEntry, PaymentSplit, Sale } from '../types';
import { calculatePlayerCost, getTotalConsumptionsCost } from './timeSlots';
import { playerCreditAmount } from './playerCredit';

export interface PlayerMovement {
  id: string;
  date: string;
  time: string;
  title: string;
  kind: string;
  amount: number;
  credit: boolean;
  debit: number;
  paid: number;
  balance: number;
  payments: { method?: string; amount: number }[];
  items: { name: string; amount: number }[];
  notes?: string;
}

const round = (amount: number) => Math.round(amount * 100) / 100;

export function getPlayerMovements(playerId: string, bookings: Booking[], sales: Sale[], entries: CurrentAccountEntry[]): PlayerMovement[] {
  const movements: Omit<PlayerMovement, 'debit' | 'paid' | 'balance'>[] = [];
  const bookingIds = new Set<string>();
  const saleIds = new Set<string>();
  bookings.filter(b => b.status === 'completed' && b.players.some(p => p.id === playerId)).forEach(booking => {
    bookingIds.add(booking.id);
    const player = booking.players.find(p => p.id === playerId)!;
    const amount = round(calculatePlayerCost(booking)[playerId] ?? 0);
    const courtTotal = booking.totalPrice > 0 ? booking.totalPrice : Math.max((booking.finalTotal ?? 0) - getTotalConsumptionsCost(booking), 0);
    const items = [{ name: `Cancha · ${booking.startTime.slice(0, 5)} a ${booking.endTime.slice(0, 5)} — Importe individual`, amount: round(courtTotal / booking.players.length) }];
    booking.consumptions.forEach(item => {
      const recipients = item.splitBetweenPlayers ? booking.players.map(p => p.id) : item.assignedToPlayers ?? [];
      if (recipients.includes(playerId)) items.push({ name: `${item.quantity} × ${item.name} — Importe individual`, amount: round(item.price * item.quantity / recipients.length) });
    });
    const payments: PaymentSplit[] = player.paymentSplits?.filter(p => p.amount > 0).map(p => ({ ...p })) ?? [];
    if (payments.length) {
      const credit = payments.find(p => p.method === 'current_account');
      if (credit) credit.amount = playerCreditAmount(player, amount);
    }
    movements.push({ id: `booking:${booking.id}`, date: booking.date, time: booking.startTime, title: `Turno · ${booking.courtName}`, kind: 'Turno', amount, credit: false,
      payments: payments.length ? payments : [{ method: player.paymentMethod ?? booking.paymentMethod, amount }], items });
  });
  sales.filter(s => s.customer.id === playerId).forEach(sale => {
    if (sale.type === 'booking' && sale.bookingId && bookingIds.has(sale.bookingId)) {
      saleIds.add(sale.id);
      return;
    }
    // Bookings are represented by each player's own share, never the whole sale.
    if (sale.type !== 'direct') return;
    saleIds.add(sale.id);
    movements.push({ id: `sale:${sale.id}`, date: sale.date, time: sale.time, title: 'Venta directa', kind: 'Venta', amount: sale.totalAmount, credit: false,
      payments: [{ method: sale.paymentMethod, amount: sale.totalAmount }],
      items: sale.items.map(item => ({ name: `${item.quantity} × ${item.name}`, amount: item.subtotal })), notes: sale.notes });
  });
  entries.filter(e => e.playerId === playerId).forEach(entry => {
    if (entry.type === 'debit' && ((entry.relatedBookingId && bookingIds.has(entry.relatedBookingId)) || (entry.relatedSaleId && saleIds.has(entry.relatedSaleId)))) return;
    movements.push({ id: `account:${entry.id}`, date: entry.date, time: entry.time, title: entry.description, kind: entry.type === 'credit' ? 'Pago de cuenta' : 'Cargo de cuenta', amount: entry.amount, credit: entry.type === 'credit',
      payments: [{ method: entry.type === 'debit' ? 'current_account' : entry.paymentMethod, amount: entry.amount }], items: [] });
  });
  const sorted = movements.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) || b.id.localeCompare(a.id));
  let balance = 0;
  return sorted.map(movement => {
    // Reconcile against the actual account entries so cash/card/transfer purchases
    // appear in the history without increasing the player's outstanding debt.
    const linkedSaleIds = movement.id.startsWith('booking:')
      ? sales.filter(s => s.bookingId === movement.id.slice(8) && saleIds.has(s.id)).map(s => s.id) : [];
    const related = entries.filter(entry => entry.playerId === playerId && (
      movement.id === `account:${entry.id}` ||
      (entry.type === 'debit' && (
        (!!entry.relatedBookingId && movement.id === `booking:${entry.relatedBookingId}`) ||
        (!!entry.relatedSaleId && (movement.id === `sale:${entry.relatedSaleId}` || linkedSaleIds.includes(entry.relatedSaleId)))
      ))
    ));
    const change = round(related.reduce((sum, entry) => sum + (entry.type === 'credit' ? entry.amount : -entry.amount), 0));
    balance = round(balance + change);
    return { ...movement, debit: movement.credit ? 0 : movement.amount,
      paid: movement.credit ? movement.amount : round(movement.amount + change), balance };
  }).reverse();
}
