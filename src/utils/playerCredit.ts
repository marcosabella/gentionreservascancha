import type { Booking, Player, PlayerProfile } from '../types';
import { calculatePlayerCost } from './timeSlots';

export const isCreditEnabled = (playerId: string | undefined, players: PlayerProfile[]) =>
  players.some(player => player.id === playerId && player.currentAccountEnabled === true);

export function playerCreditAmount(player: Player, cost: number) {
  const splits = player.paymentSplits ?? [];
  const credit = splits.filter(split => split.method === 'current_account');
  if (credit.length) return Math.round((credit.reduce((sum, split) => sum + split.amount, 0) + Math.max(0, cost - splits.reduce((sum, split) => sum + split.amount, 0))) * 100) / 100;
  return player.paymentMethod === 'current_account' ? Math.round(cost * 100) / 100 : 0;
}

export function playersWithUnauthorizedCredit(next: Booking, original: Booking, profiles: PlayerProfile[]) {
  const costs = calculatePlayerCost(next);
  const previousCosts = original.status === 'completed' ? calculatePlayerCost(original) : {};
  return next.players.filter(player => {
    if (isCreditEnabled(player.id, profiles)) return false;
    const previous = original.status === 'completed' ? original.players.find(p => p.id === player.id) : undefined;
    return playerCreditAmount(player, costs[player.id] ?? 0) > (previous ? playerCreditAmount(previous, previousCosts[player.id] ?? 0) : 0);
  });
}
