import type { Booking, PaymentSplit, Player } from '../types';

export const complimentaryAmount = (player: Pick<Player, 'paymentSplits'>) =>
  (player.paymentSplits || []).filter(split => split.method === 'complimentary').reduce((sum, split) => sum + Math.round(split.amount * 100), 0) / 100;

export const bookingComplimentaryTotal = (booking: Pick<Booking, 'players'>) =>
  booking.players.reduce((sum, player) => sum + Math.round(complimentaryAmount(player) * 100), 0) / 100;

export const bookingNetTotal = (booking: Pick<Booking, 'players' | 'finalTotal' | 'totalPrice'>) =>
  Math.max(0, Math.round(((booking.finalTotal ?? booking.totalPrice) - bookingComplimentaryTotal(booking)) * 100) / 100);

export function bookingCostBreakdown(booking: Pick<Booking, 'players' | 'consumptions' | 'totalPrice' | 'finalTotal'>) {
  const court = Object.fromEntries(booking.players.map(player => [player.id, 0]));
  const consumptions = { ...court };
  const distribute = (amount: number, ids: string[], totals: Record<string, number>) => {
    const recipients = booking.players.filter(player => ids.includes(player.id));
    if (!recipients.length) return;
    const cents = Math.round(amount * 100), base = Math.floor(cents / recipients.length);
    recipients.forEach((player, index) => { totals[player.id] += base + (index < cents % recipients.length ? 1 : 0); });
  };
  const consumptionTotal = booking.consumptions.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const courtTotal = booking.totalPrice > 0 ? booking.totalPrice : Math.max((booking.finalTotal || 0) - consumptionTotal, 0);
  distribute(courtTotal, booking.players.map(player => player.id), court);
  booking.consumptions.forEach(item => distribute(item.price * item.quantity,
    item.splitBetweenPlayers ? booking.players.map(player => player.id) : item.assignedToPlayers || [], consumptions));
  return Object.fromEntries(booking.players.map(player => [player.id, {
    court: court[player.id] / 100, consumptions: consumptions[player.id] / 100,
    total: (court[player.id] + consumptions[player.id]) / 100
  }]));
}

// A shortcut settles this player's share without charging their teammates.
export function toggleComplimentary(player: Player, scope: 'court' | 'consumptions', share: number, total: number): PaymentSplit[] {
  const current = player.paymentSplits || [];
  const existing = current.find(split => split.method === 'complimentary' && split.complimentaryFor === scope);
  const bonus = current.filter(split => split.method === 'complimentary' && split !== existing);
  if (!existing && share > 0) bonus.push({ method: 'complimentary', amount: share, complimentaryFor: scope });
  const net = Math.max(0, Math.round((total - bonus.reduce((sum, split) => sum + split.amount, 0)) * 100) / 100);
  const method = current.find(split => split.method !== 'complimentary')?.method || player.paymentMethod || 'cash';
  return [...(net > 0 ? [{ method, amount: net }] : []), ...bonus];
}
