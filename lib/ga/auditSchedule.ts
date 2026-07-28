import { getJakartaYmd, jakartaDateTime } from './jakartaDate';
import { isIndonesianNationalHoliday } from './indonesiaHolidays';

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function isWeekendJakarta(y: number, m: number, d: number): boolean {
  const date = jakartaDateTime(y, m, d, 12);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isNonWorkingDay(y: number, m: number, d: number): boolean {
  return isWeekendJakarta(y, m, d) || isIndonesianNationalHoliday(y, m, d);
}

/** Nomor hari (1–31) saat audit trail di-generate: H-2, geser mundur jika libur. */
export function resolveAuditGenerateDay(y: number, m: number): number {
  const lastDay = daysInMonth(y, m);
  let day = lastDay - 2;
  while (day >= 1 && isNonWorkingDay(y, m, day)) {
    day--;
  }
  return Math.max(day, 1);
}

export function shouldRunAuditGenerateToday(date: Date = new Date()): boolean {
  const { y, m, d } = getJakartaYmd(date);
  return d === resolveAuditGenerateDay(y, m);
}

function offsetLabel(lastDay: number, scheduledDay: number): string {
  const offset = lastDay - scheduledDay;
  return offset === 2 ? 'H-2' : `H-${offset}`;
}

/** Deskripsi jadwal untuk log/UI, mis. "H-2 (29 Jul 2026)" atau "H-3 (28 Agt 2026, H-2 libur)". */
export function describeAuditSchedule(y: number, m: number): string {
  const lastDay = daysInMonth(y, m);
  const scheduledDay = resolveAuditGenerateDay(y, m);
  const h2Day = lastDay - 2;
  const label = offsetLabel(lastDay, scheduledDay);
  const dateStr = jakartaDateTime(y, m, scheduledDay).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (scheduledDay === h2Day) {
    return `${label} (${dateStr})`;
  }

  const h2Str = jakartaDateTime(y, m, h2Day).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
  });
  return `${label} (${dateStr}, H-2 ${h2Str} libur)`;
}

export function describeAuditScheduleForToday(date: Date = new Date()): string {
  const { y, m } = getJakartaYmd(date);
  return describeAuditSchedule(y, m);
}
