import type { Booking } from '../types';

// An explicit empty split list means this player paid zero (another player may
// have covered the share). Only old records without splits use the legacy share.
export function playerPaymentAmount(player: Booking['players'][number], legacyShare: number): number {
  if (player.paymentSplits != null) return player.paymentSplits.reduce((sum, part) => sum + part.amount, 0);
  return player.paymentMethod ? legacyShare : 0;
}
