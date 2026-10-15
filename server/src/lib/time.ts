export function getPage(input: { page?: number; pageSize?: number }) {
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? Math.min(input.pageSize, 100) : 20;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function pageResult<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, page, pageSize, total };
}

export function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
}

export function startOfZonedMonth(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(parts.year, parts.month, 1, 0, 0, timeZone);
}

export function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = timeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function formatInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(date);
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(date);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
