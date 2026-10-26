import type { Sale } from '../types';
import { getSaleShares, saleNetTotal, saleParticipantAmounts } from './saleDistribution';

export const salesPaymentMethods = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'transfer', label: 'Transferencia' },
  { id: 'current_account', label: 'Cuenta Corriente' },
] as const;

type PaymentBucket = Sale['paymentMethod'] | 'unassigned';
export type SalesPaymentTotals = Record<PaymentBucket, number>;
export type SalesPaymentFilter = 'all' | Sale['paymentMethod'];

export function matchesSalePayment(sale: Sale, method: SalesPaymentFilter) {
  return method === 'all' || getSalePaymentTotals(sale)[method] > 0;
}

const emptyTotals = (): SalesPaymentTotals => ({ cash: 0, card: 0, transfer: 0, current_account: 0, unassigned: 0 });
const cents = (amount: number) => Math.round(amount * 100);

export function isSaleInPeriod(date: string, from: string, to: string) {
  return (!from || date >= from) && (!to || date <= to);
}

export function getSalePaymentTotals(sale: Sale): SalesPaymentTotals {
  const totals = emptyTotals();
  const add = (method: string | undefined, amount: number) => {
    if (method === 'complimentary') return;
    const bucket = salesPaymentMethods.some(payment => payment.id === method)
      ? method as Sale['paymentMethod'] : 'unassigned';
    totals[bucket] += cents(amount);
  };
  const players = sale.bookingPlayers;
  if (sale.type === 'direct' && sale.distribution) {
    const shares = getSaleShares(sale.items, sale.distribution);
    sale.distribution.participants.forEach(person => add(person.paymentMethod || sale.paymentMethod, saleParticipantAmounts(person, shares[person.id] || 0).net));
  } else if (sale.type !== 'booking' || !players?.length) {
    add(sale.paymentMethod, sale.totalAmount);
  } else {
    // Older bookings have only a payment method; distribute their costs in cents.
    const shares: Record<string, number> = Object.fromEntries(players.map(player => [player.id, 0]));
    const distribute = (amount: number, ids: string[]) => {
      const recipients = [...new Set(ids)].filter(id => id in shares);
      if (!recipients.length) return;
      const amountCents = cents(amount);
      const base = Math.floor(amountCents / recipients.length);
      const remainder = amountCents - base * recipients.length;
      recipients.forEach((id, index) => { shares[id] += base + (index < remainder ? 1 : 0); });
    };
    const consumptions = sale.bookingConsumptions ?? [];
    const courtTotal = sale.bookingTotalPrice ?? Math.max(0, sale.totalAmount - consumptions.reduce((sum, item) => sum + item.price * item.quantity, 0));
    distribute(courtTotal, players.map(player => player.id));
    consumptions.forEach(item => distribute(item.price * item.quantity,
      item.splitBetweenPlayers ? players.map(player => player.id) : item.assignedToPlayers ?? []));
    players.forEach(player => {
      if (player.paymentSplits != null) {
        player.paymentSplits.forEach(split => add(split.method, split.amount));
      } else {
        add(player.paymentMethod, shares[player.id] / 100);
      }
    });
  }
  return Object.fromEntries(Object.entries(totals).map(([method, amount]) => [method, amount / 100])) as SalesPaymentTotals;
}

export function summarizeSales(sales: Sale[]) {
  const payments = emptyTotals();
  let totalCents = 0;
  sales.forEach(sale => {
    totalCents += cents(saleNetTotal(sale));
    const amounts = getSalePaymentTotals(sale);
    (Object.keys(payments) as PaymentBucket[]).forEach(method => { payments[method] += cents(amounts[method]); });
  });
  const paymentTotal = Object.values(payments).reduce((sum, amount) => sum + amount, 0);
  return {
    total: totalCents / 100,
    payments: Object.fromEntries(Object.entries(payments).map(([method, amount]) => [method, amount / 100])) as SalesPaymentTotals,
    difference: (totalCents - paymentTotal) / 100,
  };
}
