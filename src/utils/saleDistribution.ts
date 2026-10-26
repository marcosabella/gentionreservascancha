import type { Sale, SaleDistribution, SaleItem, SaleParticipant } from '../types';

export const isFinalConsumer = (person: Pick<SaleParticipant, 'registered' | 'name'>) =>
  !person.registered && person.name.trim().toLocaleLowerCase() === 'consumidor final';

export function saleParticipantAmounts(person: SaleParticipant, gross: number) {
  const waived = person.paymentMethod === 'complimentary' ? gross : person.complimentary?.amount || 0;
  return { gross, waived, net: Math.round((gross - waived) * 100) / 100 };
}

export function saleComplimentaryTotal(sale: Pick<Sale, 'items' | 'distribution'>) {
  if (!sale.distribution) return 0;
  const shares = getSaleShares(sale.items, sale.distribution);
  return sale.distribution.participants.reduce((sum, person) => sum + Math.round(saleParticipantAmounts(person, shares[person.id] || 0).waived * 100), 0) / 100;
}

export const saleNetTotal = (sale: Pick<Sale, 'items' | 'distribution' | 'totalAmount'>) =>
  Math.round((sale.totalAmount - saleComplimentaryTotal(sale)) * 100) / 100;

export function addSaleParticipant(people: SaleParticipant[], person: SaleParticipant): SaleParticipant[] {
  const remaining = person.name.trim().toLocaleLowerCase() === 'consumidor final' ? people :
    people.filter(existing => existing.registered || existing.name.trim().toLocaleLowerCase() !== 'consumidor final');
  return remaining.some(existing => existing.id === person.id) ? remaining : [...remaining, { ...person, paymentMethod: person.paymentMethod || 'cash' }];
}

// Assign the remaining cents in participant order so the shares equal the sale.
export function getSaleShares(items: SaleItem[], distribution: SaleDistribution): Record<string, number> {
  const shares = Object.fromEntries(distribution.participants.map(person => [person.id, 0]));
  for (const item of items) {
    const assignment = distribution.items.find(row => row.consumableId === item.consumableId);
    const recipients = distribution.participants.filter(person =>
      !assignment || assignment.splitBetweenPlayers || assignment.assignedToPlayers.includes(person.id));
    if (!recipients.length) continue;
    const cents = Math.round(item.subtotal * 100);
    const base = Math.floor(cents / recipients.length);
    recipients.forEach((person, index) => { shares[person.id] += base + (index < cents % recipients.length ? 1 : 0); });
  }
  return Object.fromEntries(Object.entries(shares).map(([id, cents]) => [id, cents / 100]));
}

export function validateSaleDistribution(items: SaleItem[], distribution: SaleDistribution): string | null {
  const people = distribution.participants;
  if (!people.length || people.some(person => !person.id || !person.name.trim()) || new Set(people.map(person => person.id)).size !== people.length)
    return 'Revisá los jugadores/clientes de la venta.';
  for (const item of items) {
    const assignment = distribution.items.find(row => row.consumableId === item.consumableId);
    if (assignment && !assignment.splitBetweenPlayers &&
      (!assignment.assignedToPlayers.length || assignment.assignedToPlayers.some(id => !people.some(person => person.id === id))))
      return `Seleccioná quiénes comparten ${item.name}.`;
  }
  const shares = getSaleShares(items, distribution);
  for (const person of people) {
    const { waived, net } = saleParticipantAmounts(person, shares[person.id] || 0);
    if (isFinalConsumer(person) && (person.paymentMethod === 'complimentary' || waived > 0))
      return 'La bonificación no aplica a Consumidor Final. Agregá un jugador o cliente con nombre.';
    if (!Number.isFinite(waived) || waived < 0 || net < 0 || Math.abs(waived * 100 - Math.round(waived * 100)) > 0.000001)
      return `Revisá el importe bonificado de ${person.name}.`;
  }
  return null;
}
