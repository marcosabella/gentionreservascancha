import { CourtUnavailability } from '../types';
import { dateOnlyToLocalDate } from './date';

export const timeToMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

export const timeRangesOverlap = (
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string
): boolean => {
  return timeToMinutes(firstStart) < timeToMinutes(secondEnd) &&
    timeToMinutes(firstEnd) > timeToMinutes(secondStart);
};

export const getUnavailabilityForSlot = (
  unavailabilities: CourtUnavailability[],
  courtId: string,
  date: string,
  startTime: string,
  endTime: string
): CourtUnavailability | undefined => {
  const dayOfWeek = dateOnlyToLocalDate(date).getDay();

  return unavailabilities.find(item => {
    if (!item.isActive || item.courtId !== courtId) return false;

    const appliesToDate = item.isRecurring
      ? item.dayOfWeek === dayOfWeek
      : item.date === date;

    return appliesToDate && timeRangesOverlap(item.startTime, item.endTime, startTime, endTime);
  });
};

export const getReasonLabel = (reason: CourtUnavailability['reason']): string => {
  switch (reason) {
    case 'class':
      return 'Clase';
    case 'closed':
      return 'Cerrado';
    case 'maintenance':
      return 'Mantenimiento';
    case 'other':
      return 'Otro';
    default:
      return reason;
  }
};
