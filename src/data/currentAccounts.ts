import { CurrentAccountEntry, PlayerCurrentAccount } from '../types';

export const initialCurrentAccountEntries: CurrentAccountEntry[] = [
  
    
];

export const calculatePlayerBalance = (playerId: string, entries: CurrentAccountEntry[]): number => {
  return entries
    .filter(entry => entry.playerId === playerId)
    .reduce((balance, entry) => {
      return entry.type === 'debit' 
        ? balance - entry.amount  // Debe (negativo)
        : balance + entry.amount; // Pago (positivo)
    }, 0);
};

export const getPlayerCurrentAccount = (playerId: string, playerName: string, entries: CurrentAccountEntry[]): PlayerCurrentAccount => {
  const playerEntries = entries
    .filter(entry => entry.playerId === playerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  const balance = calculatePlayerBalance(playerId, entries);
  const lastMovement = playerEntries.length > 0 ? playerEntries[0].date : undefined;
  
  return {
    playerId,
    playerName,
    balance,
    entries: playerEntries,
    lastMovement
  };
};