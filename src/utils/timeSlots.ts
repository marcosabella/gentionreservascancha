import { TimeSlot, Booking, RecurringBooking, CourtUnavailability } from '../types';
import { getUnavailabilityForSlot, timeToMinutes } from './availability';

export const generateTimeOptionsForDropdown = (startTime: string = '13:30', endTime: string = '24:00', slotDuration: number = 90): string[] => {
  const timeOptions: string[] = [];
  
  // Parse start and end times
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  // Generate time options every 30 minutes
  let currentTime = startHour * 60 + startMinute; // Convert to minutes
  const endTimeMinutes = endHour * 60 + endMinute;
  const increment = 30; // 30 minutes increment

  while (currentTime <= endTimeMinutes) {
    const hours = Math.floor(currentTime / 60);
    const minutes = currentTime % 60;
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    timeOptions.push(timeString);
    currentTime += increment;
  }

  return timeOptions;
};

export const generateTimeSlots = (
  bookings: Booking[],
  recurringBookings: RecurringBooking[],
  courtUnavailabilities: CourtUnavailability[],
  courtId: string,
  date: string,
  startTime: string = '13:30',
  endTime: string = '24:00'
): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const activeBookingStatuses = ['confirmed', 'in-progress', 'pending', 'completed'];
  const getBookingStatusRank = (booking: Booking) => {
    if (booking.status === 'completed') return 3;
    if (booking.status === 'cancelled') return 1;
    return 2;
  };
  const getCreatedAtTime = (booking: Booking) => {
    const createdAtTime = new Date(booking.createdAt).getTime();
    return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
  };
  const isPreferredBooking = (candidate: Booking, current: Booking) => {
    const candidateRank = getBookingStatusRank(candidate);
    const currentRank = getBookingStatusRank(current);

    if (candidateRank !== currentRank) {
      return candidateRank > currentRank;
    }

    return getCreatedAtTime(candidate) > getCreatedAtTime(current);
  };

  // Get day of week for the selected date (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const selectedDate = new Date(date + 'T00:00:00');
  const dayOfWeek = selectedDate.getDay();

  console.log('=== GENERATING TIME SLOTS ===');
  console.log('Court ID:', courtId);
  console.log('Date:', date);
  console.log('Day of week:', dayOfWeek, '(0=Sunday, 1=Monday, ..., 6=Saturday)');
  console.log('Total bookings received:', bookings.length);
  console.log('Total recurring bookings received:', recurringBookings.length);
  
  // Log all bookings data
  console.log('ALL BOOKINGS:', bookings.map(b => ({
    id: b.id,
    courtId: b.courtId,
    courtName: b.courtName,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
    isRecurring: b.isRecurring
  })));
  
  // Log all recurring bookings data
  console.log('ALL RECURRING BOOKINGS:', recurringBookings.map(r => ({
    id: r.id,
    courtId: r.courtId,
    courtName: r.courtName,
    playerName: r.playerName,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    isActive: r.isActive,
    skipDates: r.skipDates
  })));
  
  // Filter bookings for this court and date
  const relevantBookings = bookings.filter(booking => 
    booking.courtId === courtId && 
    booking.date === date && 
    activeBookingStatuses.includes(booking.status)
  );
  
  // Filter recurring bookings for this court and day
  const relevantRecurringBookings = recurringBookings.filter(recurring =>
    recurring.courtId === courtId &&
    recurring.dayOfWeek === dayOfWeek &&
    recurring.isActive &&
    !recurring.skipDates.includes(date)
  );
  
  console.log('RELEVANT BOOKINGS for court/date:', relevantBookings);
  console.log('RELEVANT RECURRING BOOKINGS for court/day:', relevantRecurringBookings);

  // Parse start and end times
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  // Generate slots every 1.5 hours (90 minutes)
  let currentTime = startHour * 60 + startMinute; // Convert to minutes
  const endTimeMinutes = endHour * 60 + endMinute;
  const slotDuration = 90; // 90 minutes = 1.5 hours

  while (currentTime + slotDuration <= endTimeMinutes) {
    const startHours = Math.floor(currentTime / 60);
    const startMinutes = currentTime % 60;
    const endTimeSlot = currentTime + slotDuration;
    const endHours = Math.floor(endTimeSlot / 60);
    const endMinutesSlot = endTimeSlot % 60;
    
    const time = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`;
    const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutesSlot.toString().padStart(2, '0')}`;
    
    console.log(`\n--- Checking slot ${time} ---`);
    
    // Check if there's a regular booking that overlaps with this time slot
    const existingBooking = bookings.reduce<Booking | undefined>((selectedBooking, booking) => {
      const isCorrectCourt = booking.courtId === courtId;
      const isCorrectDate = booking.date === date;
      const isActive = activeBookingStatuses.includes(booking.status);
      
      // Check for time overlap: booking overlaps if it starts before our slot ends and ends after our slot starts
      const bookingStartMinutes = timeToMinutes(booking.startTime);
      const bookingEndMinutes = timeToMinutes(booking.endTime);
      const slotStartMinutes = currentTime;
      const slotEndMinutes = currentTime + slotDuration;
      
      const hasTimeOverlap = bookingStartMinutes < slotEndMinutes && bookingEndMinutes > slotStartMinutes;
      
      const matches = isCorrectCourt && isCorrectDate && isActive && hasTimeOverlap;
      
      if (isCorrectCourt && isCorrectDate && isActive) {
        console.log('Found booking for same court/date:', {
          bookingId: booking.id,
          bookingStart: booking.startTime,
          bookingEnd: booking.endTime,
          slotStart: time,
          slotEnd: slotEndTime,
          status: booking.status,
          hasTimeOverlap,
          matches
        });
      }
      
      if (!matches) {
        return selectedBooking;
      }

      if (!selectedBooking || isPreferredBooking(booking, selectedBooking)) {
        return booking;
      }

      return selectedBooking;
    }, undefined);

    // Check if there's a recurring booking that overlaps with this time slot
    const recurringBooking = recurringBookings.find(recurring => {
      const isCorrectCourt = recurring.courtId === courtId;
      const isCorrectDay = recurring.dayOfWeek === dayOfWeek;
      const isActive = recurring.isActive;
      const isNotSkipped = !recurring.skipDates.includes(date);
      
      // Check for time overlap with recurring booking
      const recurringStartMinutes = timeToMinutes(recurring.startTime);
      const recurringEndMinutes = timeToMinutes(recurring.endTime);
      const slotStartMinutes = currentTime;
      const slotEndMinutes = currentTime + slotDuration;
      
      const hasTimeOverlap = recurringStartMinutes < slotEndMinutes && recurringEndMinutes > slotStartMinutes;
      
      const matches = isCorrectCourt && isCorrectDay && isActive && isNotSkipped && hasTimeOverlap;
      
      if (isCorrectCourt && isCorrectDay && isActive && isNotSkipped) {
        console.log('Found recurring booking for same court/day:', {
          recurringId: recurring.id,
          playerName: recurring.playerName,
          recurringStart: recurring.startTime,
          recurringEnd: recurring.endTime,
          slotStart: time,
          slotEnd: slotEndTime,
          hasTimeOverlap,
          matches
        });
      }
      
      return matches;
    });

    const unavailability = getUnavailabilityForSlot(
      courtUnavailabilities,
      courtId,
      date,
      time,
      slotEndTime
    );

    const isAvailable = !existingBooking && !recurringBooking && !unavailability;
    const conflictingBookingId = existingBooking?.id;
    
    console.log('Final slot result:', {
      time,
      available: isAvailable,
      hasExistingBooking: !!existingBooking,
      hasRecurringBooking: !!recurringBooking,
      hasUnavailability: !!unavailability,
      bookingId: conflictingBookingId,
      recurringPlayer: recurringBooking?.playerName
    });
    
    slots.push({
      time,
      available: isAvailable,
      bookingId: conflictingBookingId,
      unavailableId: unavailability?.id
    });

    currentTime += slotDuration; // Move to next slot
  }

  console.log('=== FINAL SLOTS GENERATED ===');
  console.log('Total slots:', slots.length);
  console.log('Available slots:', slots.filter(s => s.available).length);
  console.log('Occupied slots:', slots.filter(s => !s.available).length);
  console.log('All slots:', slots);
  
  return slots;
};

export const calculateDuration = (startTime: string, endTime: string): number => {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(amount);
};

export const formatDate = (date: string): string => {
  // Crear fecha en zona horaria local para evitar problemas de UTC
  const [year, month, day] = date.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  
  return localDate.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatDateTimeArgentina = (dateTime: string): { date: string; time: string } => {
  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return { date: 'Fecha invalida', time: '' };
  }

  return {
    date: new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date),
    time: new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)
  };
};

export const calculatePlayerCost = (booking: Booking): { [playerId: string]: number } => {
  const playerCosts: { [playerId: string]: number } = {};
  const numPlayers = booking.players.length;
  if (numPlayers === 0) return playerCosts;

  const totalConsumptionsCost = getTotalConsumptionsCost(booking);
  const courtCost = booking.totalPrice > 0
    ? booking.totalPrice
    : Math.max((booking.finalTotal || 0) - totalConsumptionsCost, 0);
  
  // Initialize player costs with court cost divided equally
  const courtCostPerPlayer = courtCost / numPlayers;
  booking.players.forEach(player => {
    playerCosts[player.id] = courtCostPerPlayer;
  });
  
  // Add consumption costs
  booking.consumptions.forEach(consumption => {
    const totalConsumptionCost = consumption.price * consumption.quantity;
    
    if (consumption.splitBetweenPlayers) {
      // Split equally between all players
      const costPerPlayer = totalConsumptionCost / numPlayers;
      booking.players.forEach(player => {
        playerCosts[player.id] += costPerPlayer;
      });
    } else if (consumption.assignedToPlayers && consumption.assignedToPlayers.length > 0) {
      // Split between assigned players
      const costPerPlayer = totalConsumptionCost / consumption.assignedToPlayers.length;
      consumption.assignedToPlayers.forEach(playerId => {
        if (playerCosts[playerId] !== undefined) {
          playerCosts[playerId] += costPerPlayer;
        }
      });
    } else {
      // If not split and no specific assignment, don't add to any player cost
      // This handles the case where splitBetweenPlayers is false but no players are assigned
    }
  });
  
  return playerCosts;
};

export const getTotalConsumptionsCost = (booking: Booking): number => {
  return booking.consumptions.reduce((total, consumption) => {
    return total + (consumption.price * consumption.quantity);
  }, 0);
};
