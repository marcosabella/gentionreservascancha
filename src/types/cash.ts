export interface CashSession {
  id: string;
  opened_at: string;
  opened_by_name: string;
  opening_amount: number;
  opening_notes: string;
  closed_at: string | null;
  closed_by_name: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  retained_cash: number | null;
  handed_over: number | null;
  closing_notes: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
  delete_reason: string | null;
}

export interface CashAudit {
  id: string;
  session_id: string;
  created_at: string;
  actor_name: string;
  action: string;
  reason: string;
  before_data: CashSession | null;
  after_data: CashSession;
}

export interface CashMovement {
  id: string;
  session_id: string;
  created_at: string;
  actor_name: string;
  kind: 'collection' | 'correction' | 'manual_in' | 'expense' | 'withdrawal' | 'reversal';
  method: 'cash' | 'card' | 'transfer';
  amount: number;
  description: string;
  source_detail?: string[];
  source_type: 'booking' | 'sale' | 'account' | null;
  source_id: string | null;
  reversal_of: string | null;
}
