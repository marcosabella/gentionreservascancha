import { supabase } from '../lib/supabase';

export interface AnnouncementPlayer { id: string; name: string; category: number | null; gender: string | null; push_devices: number }
export interface AnnouncementFilter { category: number | null; gender: string | null; player_id: string | null; player_ids?: string[] }
export interface PlayerAnnouncement { id: string; title: string; body: string; created_at: string; read_at: string | null }
export interface AnnouncementHistory {
  id: string; title: string; body: string; created_at: string; sender: string;
  players: number; devices: number; queued: number; sending: number; sent: number; failed: number; untracked: number; read_players: number;
}
export interface AnnouncementDelivery {
  id: string; player_name: string; state: 'queued' | 'sending' | 'sent' | 'failed'; attempts: number;
  last_status: number | null; next_attempt_at: string | null; created_at: string; finished_at: string | null;
}
export const playerAnnouncementsService = {
  async history(before: AnnouncementHistory | null = null): Promise<AnnouncementHistory[]> {
    const { data, error } = await supabase.rpc('admin_player_announcement_history', { before_at: before?.created_at ?? null, before_id: before?.id ?? null });
    if (error) throw error;
    return data;
  },
  async deliveries(target: string, before: string | null = null): Promise<AnnouncementDelivery[]> {
    const { data, error } = await supabase.rpc('admin_player_announcement_deliveries', { target, before_id: before });
    if (error) throw error;
    return data;
  },
  async audience(): Promise<AnnouncementPlayer[]> {
    const { data, error } = await supabase.rpc('player_announcement_audience');
    if (error) throw error;
    return data;
  },
  async send(id: string, title: string, body: string, filter: AnnouncementFilter): Promise<{ players: number; devices: number }> {
    const { data, error } = await supabase.rpc('send_player_announcement', { request_id: id, heading: title, message: body, filters: filter });
    if (error) throw error;
    return data;
  },
  async list(before: PlayerAnnouncement | null = null): Promise<{ items: PlayerAnnouncement[]; unreadCount: number }> {
    const { data, error } = await supabase.rpc('player_announcement_feed', { before_at: before?.created_at ?? null, before_id: before?.id ?? null });
    if (error) throw error;
    return data;
  },
  async read(id: string) {
    const { error } = await supabase.rpc('read_player_announcement', { target: id });
    if (error) throw error;
  },
};

export function filterAnnouncementPlayers(players: AnnouncementPlayer[], filter: AnnouncementFilter) {
  return players.filter(player => (filter.category === null || player.category === filter.category)
    && (filter.gender === null || player.gender === filter.gender)
    && (filter.player_id === null || player.id === filter.player_id)
    && (filter.player_ids === undefined || filter.player_ids.includes(player.id)));
}

export function searchAnnouncementPlayers(players: AnnouncementPlayer[], search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  return players.filter(player => terms.every(term => normalize(player.name).includes(term)));
}
