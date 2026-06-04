export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const argentinaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARGENTINA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const argentinaTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARGENTINA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

export const getArgentinaDateString = (date: Date = new Date()): string => {
  const parts = argentinaDateFormatter.formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('No se pudo calcular la fecha de Argentina');
  }

  return `${year}-${month}-${day}`;
};

export const getArgentinaTimeString = (date: Date = new Date()): string => {
  const parts = argentinaTimeFormatter.formatToParts(date);
  const hour = parts.find(part => part.type === 'hour')?.value;
  const minute = parts.find(part => part.type === 'minute')?.value;

  if (!hour || !minute) {
    throw new Error('No se pudo calcular la hora de Argentina');
  }

  return `${hour === '24' ? '00' : hour}:${minute}`;
};

export const dateOnlyToLocalDate = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

export const localDateToDateOnly = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

