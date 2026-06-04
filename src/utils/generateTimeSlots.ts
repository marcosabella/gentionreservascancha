import { Booking, RecurringBooking, TimeSlot } from '../types';

/**
 * Genera los horarios disponibles de una cancha para un día específico
 * @param bookings Bookings filtrados por cancha y fecha
 * @param recurringBookings Recurrent bookings filtrados por cancha
 * @param courtId Id de la cancha seleccionada
 * @param date Fecha seleccionada en formato "YYYY-MM-DD"
 * @param startTime Hora de inicio de la cancha (ej. "08:00")
 * @param endTime Hora de fin de la cancha (ej. "22:00")
 * @returns Array de TimeSlot
 */
export const generateTimeSlots = (
  bookings: Booking[],
  recurringBookings: RecurringBooking[],
  courtId: string,
  date: string,
  startTime: string,
  endTime: string
): TimeSlot[] => {
  const slots: TimeSlot[] = [];

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;

  const SLOT_DURATION = 90; // 1h30 en minutos
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();

  for (let current = startTotalMinutes; current + SLOT_DURATION <= endTotalMinutes; current += SLOT_DURATION) {
    const slotHour = Math.floor(current / 60);
    const slotMinute = current % 60;
    const time = `${slotHour.toString().padStart(2, '0')}:${slotMinute.toString().padStart(2, '0')}`;

    // Booking normal
    const booking = bookings.find(b => b.startTime === time);

    // Recurrente
    const recurring = recurringBookings.find(r =>
      r.dayOfWeek === dayOfWeek &&
      r.startTime === time &&
      r.isActive &&
      !r.skipDates.includes(date)
    );

    // Determinar nombre del jugador
    let playerName: string | null = null;
    if (booking?.players?.length) {
      playerName = booking.players[0].name;
    } else if (recurring) {
      playerName = recurring.playerName;
    }

    slots.push({
      time,
      bookingId: booking?.id || null,
      available: !booking && !recurring,
      playerName
    });
  }

  return slots;
};
