import { CurrentAccountEntry, PlayerCurrentAccount } from '../types';

export const calculatePlayerBalance = (playerId: string, entries: CurrentAccountEntry[]): number => {
  return entries
    .filter((entry) => entry.playerId === playerId)
    .reduce((balance, entry) => (
      entry.type === 'debit'
        ? balance - entry.amount
        : balance + entry.amount
    ), 0);
};

export const getPlayerCurrentAccount = (
  playerId: string,
  playerName: string,
  entries: CurrentAccountEntry[]
): PlayerCurrentAccount => {
  const playerEntries = entries
    .filter((entry) => entry.playerId === playerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    playerId,
    playerName,
    balance: calculatePlayerBalance(playerId, entries),
    entries: playerEntries,
    lastMovement: playerEntries[0]?.date,
  };
};
