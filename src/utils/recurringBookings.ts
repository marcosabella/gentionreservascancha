import { RecurringBooking, Booking, CourtUnavailability } from '../types';
import { dateOnlyToLocalDate, getArgentinaDateString, localDateToDateOnly } from './date';
import { getUnavailabilityForSlot } from './availability';

export const generateRecurringBookings = (
  recurringBookings: RecurringBooking[],
  existingBookings: Booking[],
  courtUnavailabilities: CourtUnavailability[] = [],
  weeksAhead: number = 4
): Omit<Booking, 'id'>[] => {
  const newBookings: Omit<Booking, 'id'>[] = [];
  const today = dateOnlyToLocalDate(getArgentinaDateString());
  
  recurringBookings
    .filter(recurring => recurring.isActive)
    .forEach(recurring => {
      // Generar reservas para las próximas semanas
      for (let week = 0; week < weeksAhead; week++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + (week * 7));
        
        // Encontrar el día de la semana correspondiente
        while (targetDate.getDay() !== recurring.dayOfWeek) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
        
        const dateString = localDateToDateOnly(targetDate);
        
        // Verificar si esta fecha está en las excepciones
        if (recurring.skipDates.includes(dateString)) {
          continue;
        }
        
        // Verificar si ya existe una reserva para esta fecha, cancha y horario
        const existingBooking = existingBookings.find(booking =>
          booking.courtId === recurring.courtId &&
          booking.date === dateString &&
          booking.startTime === recurring.startTime &&
          booking.endTime === recurring.endTime &&
          (booking.status === 'confirmed' || booking.status === 'pending' || booking.status === 'in-progress' || booking.status === 'completed') &&
          booking.isRecurring === true
        );
        
        if (existingBooking) {
          // Only log if it's the exact same recurring booking
          if (existingBooking.recurringBookingId === recurring.id) {
            console.log('Skipping recurring booking - already exists:', {
              court: recurring.courtName,
              date: dateString,
              time: recurring.startTime,
              existingBookingId: existingBooking.id
            });
          }
          continue;
        }

        const blockedSlot = getUnavailabilityForSlot(
          courtUnavailabilities,
          recurring.courtId,
          dateString,
          recurring.startTime,
          recurring.endTime
        );

        if (blockedSlot) {
          console.log('Skipping recurring booking - court unavailable:', {
            court: recurring.courtName,
            date: dateString,
            time: recurring.startTime,
            reason: blockedSlot.title
          });
          continue;
        }
        
        // Crear la reserva recurrente
        const newBooking: Omit<Booking, 'id'> = {
          courtId: recurring.courtId,
          courtName: recurring.courtName,
          date: dateString,
          startTime: recurring.startTime,
          endTime: recurring.endTime,
          players: [{
            id: recurring.playerId,
            name: recurring.playerName,
            email: '', // Se completará con datos del jugador
            phone: '', // Se completará con datos del jugador
            isOrganizer: true
          }],
          consumptions: [],
          status: 'confirmed',
          totalPrice: 0, // Se calculará con el precio de la cancha
          createdAt: new Date().toISOString(),
          isRecurring: true,
          recurringBookingId: recurring.id
        };
        
        newBookings.push(newBooking);
      }
    });
  
  return newBookings;
};

export const getNextOccurrences = (
  recurringBooking: RecurringBooking,
  count: number = 5
): string[] => {
  const occurrences: string[] = [];
  const today = dateOnlyToLocalDate(getArgentinaDateString());
  let currentDate = new Date(today);
  
  // Encontrar el próximo día que corresponde al turno fijo
  while (currentDate.getDay() !== recurringBooking.dayOfWeek) {
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Generar las próximas ocurrencias
  for (let i = 0; i < count * 2; i++) { // Generar más para filtrar las que están en skipDates
    const dateString = localDateToDateOnly(currentDate);
    
    if (!recurringBooking.skipDates.includes(dateString)) {
      occurrences.push(dateString);
    }
    
    if (occurrences.length >= count) {
      break;
    }
    
    currentDate.setDate(currentDate.getDate() + 7); // Siguiente semana
  }
  
  return occurrences;
};

export const isRecurringBookingConflict = (
  recurringBooking: Omit<RecurringBooking, 'id' | 'createdAt'>,
  existingRecurringBookings: RecurringBooking[]
): boolean => {
  return existingRecurringBookings.some(existing =>
    existing.courtId === recurringBooking.courtId &&
    existing.dayOfWeek === recurringBooking.dayOfWeek &&
    existing.startTime === recurringBooking.startTime &&
    existing.isActive
  );
};
