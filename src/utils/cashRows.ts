import type { CashMovement } from '../types/cash';
import { cashSourceDetails } from './cashSourceDetails';

export type CashMovementRow = CashMovement & {
  entries: CashMovement[];
  amounts: Record<CashMovement['method'], number>;
  currentAccount: number;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Show the net receipt in this session, using the last recorded source snapshot.
// Keep the original entries for reconciliation; never merge different sessions.
export function cashMovementRows(movements: CashMovement[]): CashMovementRow[] {
  const rows: CashMovementRow[] = [];
  const candidates = new Map<string, CashMovementRow>();
  for (const movement of movements) {
    const key = JSON.stringify([movement.session_id, movement.source_type, movement.source_id]);
    const isReceipt = Boolean(movement.source_type && movement.source_id);
    const candidate = isReceipt ? candidates.get(key) : undefined;
    if (candidate) {
      candidate.entries.push(movement);
      candidate.amounts[movement.method] = round(candidate.amounts[movement.method] + Number(movement.amount));
      if (Date.parse(movement.created_at) >= Date.parse(candidate.created_at)) {
        candidate.created_at = movement.created_at;
        candidate.actor_name = movement.actor_name;
        candidate.source_name = movement.source_name;
        candidate.source_detail = movement.source_detail;
        candidate.description = movement.description;
      }
    } else {
      const row: CashMovementRow = { ...movement, entries: [movement],
        currentAccount: cashSourceDetails(movement.source_detail).payments.filter(payment => payment.method === 'Cuenta corriente').reduce((sum, payment) => sum + payment.amount, 0),
        amounts: { cash: 0, card: 0, transfer: 0, [movement.method]: Number(movement.amount) } };
      rows.push(row);
      if (isReceipt) candidates.set(key, row);
    }
  }
  return rows.filter(row => {
    if (!row.source_type || !row.source_id) return true;
    row.currentAccount = cashSourceDetails(row.source_detail).payments.filter(payment => payment.method === 'Cuenta corriente').reduce((sum, payment) => sum + payment.amount, 0);
    row.amount = round(row.amounts.cash + row.amounts.card + row.amounts.transfer);
    row.kind = Object.values(row.amounts).some(value => value < 0) ? 'correction' : 'collection';
    row.description = row.description.replace(/ · ajuste$/, '');
    return Object.values(row.amounts).some(value => value !== 0) || row.currentAccount > 0;
  });
}
