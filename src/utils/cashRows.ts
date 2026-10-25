import type { CashMovement } from '../types/cash';
import { cashSourceDetails } from './cashSourceDetails';

export type CashMovementRow = CashMovement & {
  entries: CashMovement[];
  amounts: Record<CashMovement['method'], number>;
  currentAccount: number;
};

// Combine the different payment methods emitted together by a receipt.
// Keep every ledger entry for the detail, including corrections and expenses.
export function cashMovementRows(movements: CashMovement[]): CashMovementRow[] {
  const rows: CashMovementRow[] = [];
  const candidates = new Map<string, CashMovementRow>();
  for (const movement of movements) {
    const key = JSON.stringify([movement.session_id, movement.source_type, movement.source_id,
      movement.actor_name, movement.kind, movement.description, movement.source_name, movement.source_detail]);
    const candidate = movement.source_id ? candidates.get(key) : undefined;
    const elapsed = candidate ? Date.parse(movement.created_at) - Date.parse(candidate.created_at) : NaN;
    if (candidate && elapsed >= 0 && elapsed < 1000 && !candidate.entries.some(entry => entry.method === movement.method)) {
      candidate.entries.push(movement);
      candidate.amounts[movement.method] = Number(movement.amount);
    } else {
      const row: CashMovementRow = { ...movement, entries: [movement],
        currentAccount: cashSourceDetails(movement.source_detail).payments.filter(payment => payment.method === 'Cuenta corriente').reduce((sum, payment) => sum + payment.amount, 0),
        amounts: { cash: 0, card: 0, transfer: 0, [movement.method]: Number(movement.amount) } };
      rows.push(row);
      candidates.set(key, row);
    }
  }
  return rows;
}
