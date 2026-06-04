export interface Court {
  id: string;
  name: string;
  description: string;
  pricePerTurn: number;
  features: string[];
  startTime: string;
  endTime: string;
}

export interface Booking {
  id: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  players: Player[];
  totalPrice: number;
  consumptions: Consumption[];
  status: 'confirmed' | 'pending' | 'cancelled' | 'in-progress' | 'completed';
  createdAt: string;
  closedAt?: string;
  finalTotal?: number;
  paymentMethod?: 'cash' | 'card' | 'transfer' | 'current_account';
  isRecurring?: boolean; // Indica si es un turno fijo
  recurringBookingId?: string; // ID del turno fijo que lo generó
}

export interface Player {
  id: string;
  name: string;
  email: string;
  phone: string;
  isOrganizer: boolean;
  paymentMethod?: 'cash' | 'card' | 'transfer' | 'current_account';
  paymentSplits?: PaymentSplit[];
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'current_account';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export interface Consumption {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: 'equipment' | 'food' | 'drink' | 'other';
  splitBetweenPlayers: boolean;
  assignedToPlayers?: string[]; // Player IDs if not split equally
}

export interface ConsumableItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  available: boolean;
  icon?: string;
}

export interface ConsumableCategory {
  id: string;
  name: string;
  label: string;
  color: string;
  defaultIcon: string;
  createdAt: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  bookingId?: string;
  unavailableId?: string;
}

export interface ScheduleSettings {
  startTime: string;
  endTime: string;
  slotDuration: number; // in minutes
}

export interface PlayerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender?: 'masculino' | 'femenino';
  category?: number; // 1 to 7
  createdAt: string;
  totalBookings: number;
  lastBooking?: string;
}

export interface Sale {
  id: string;
  type: 'direct' | 'booking'; // direct = venta directa, booking = turno finalizado
  date: string;
  time: string;
  customerType: 'registered' | 'guest';
  customer: {
    id?: string; // Only for registered customers
    name: string;
    email?: string;
    phone?: string;
  };
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'current_account';
  notes?: string;
  createdAt: string;
  bookingId?: string; // Solo para ventas tipo 'booking'
  courtName?: string; // Solo para ventas tipo 'booking'
  bookingTotalPrice?: number; // Precio de cancha del turno finalizado
  bookingPlayers?: Player[]; // Jugadores del turno finalizado
  bookingConsumptions?: Consumption[]; // Consumibles con asignacion original del turno
}

export interface SaleItem {
  id: string;
  consumableId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CurrentAccountEntry {
  id: string;
  playerId: string;
  type: 'debit' | 'credit'; // debit = debe, credit = pago
  amount: number;
  description: string;
  date: string;
  time: string;
  relatedBookingId?: string; // Si viene de un turno
  relatedSaleId?: string; // Si viene de una venta
  paymentMethod?: 'cash' | 'card' | 'transfer'; // Solo para créditos (pagos)
  createdAt: string;
}

export interface PlayerCurrentAccount {
  playerId: string;
  playerName: string;
  balance: number; // Saldo actual (negativo = debe, positivo = a favor)
  entries: CurrentAccountEntry[];
  lastMovement?: string;
}

export interface RecurringBooking {
  id: string;
  playerId: string;
  playerName: string;
  courtId: string;
  courtName: string;
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  skipDates: string[]; // Fechas específicas donde NO se debe crear el turno (formato YYYY-MM-DD)
}

export interface CourtUnavailability {
  id: string;
  courtId: string;
  courtName: string;
  title: string;
  reason: 'class' | 'closed' | 'maintenance' | 'other';
  date?: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export interface TournamentPair {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id?: string;
  player2Name?: string;
}

export interface TournamentZone {
  id: string;
  name: string;
  pairIds: string[];
}

export interface TournamentPlayoffRound {
  id: string;
  name: string;
  matchCount: number;
  order: number;
}

export interface TournamentSetScore {
  pair1Games: number;
  pair2Games: number;
}

export interface TournamentMatch {
  id: string;
  stage: 'zone' | 'playoff';
  zoneId?: string;
  roundId?: string;
  pair1Id?: string;
  pair2Id?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  sets: TournamentSetScore[];
  winnerPairId?: string;
}

export interface Tournament {
  id: string;
  name: string;
  isActive: boolean;
  pairs: TournamentPair[];
  zones: TournamentZone[];
  playoffRounds: TournamentPlayoffRound[];
  matches: TournamentMatch[];
  createdAt: string;
}

export interface AppUser {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'player';
  playerId?: string; // Solo para usuarios tipo 'player'
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'player';
  playerId?: string;
  playerData?: PlayerProfile;
}
