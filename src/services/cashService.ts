import { supabase } from '../lib/supabase';
import type { CashMovement, CashSession, CashAudit } from '../types/cash';

export const cashService = {
  async audit(sessionId: string): Promise<CashAudit[]> {
    const entries: CashAudit[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('cash_audit').select('*').eq('session_id', sessionId)
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
      if (error) throw error;
      entries.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return entries;
  },
  async sessions(): Promise<CashSession[]> {
    const sessions: CashSession[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('cash_sessions').select('*')
        .order('opened_at', { ascending: false }).order('id').range(offset, offset + 499);
      if (error) throw error;
      sessions.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return sessions;
  },
  async movements(sessionId: string): Promise<CashMovement[]> {
    // Paginate: PostgREST's default row cap must never truncate a cash report.
    const movements: CashMovement[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('cash_movements').select('*').eq('session_id', sessionId)
        .order('created_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      movements.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return movements;
  },
  async command(action: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase.rpc('cash_command', { action, payload });
    if (error) throw error;
    return data as string;
  },
};
