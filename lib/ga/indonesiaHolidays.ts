/**
 * Libur nasional Indonesia (WIB) — perbarui di awal tahun.
 * Sumber: SKB libur nasional + cuti bersama (perkiraan untuk jadwal cron).
 */
const INDONESIA_NATIONAL_HOLIDAYS = new Set<string>([
  // --- 2025 ---
  '2025-01-01', // Tahun Baru
  '2025-01-27', // Isra Mi'raj
  '2025-01-28', // Cuti bersama Isra Mi'raj
  '2025-03-28', // Cuti bersama Idul Fitri
  '2025-03-29', // Idul Fitri
  '2025-03-30', // Idul Fitri
  '2025-03-31', // Cuti bersama Idul Fitri
  '2025-04-01', // Cuti bersama Idul Fitri
  '2025-04-18', // Wafat Isa Almasih
  '2025-05-01', // Hari Buruh
  '2025-05-12', // Waisak
  '2025-05-13', // Cuti bersama Waisak
  '2025-05-29', // Kenaikan Isa Almasih
  '2025-06-01', // Hari Pancasila
  '2025-06-06', // Idul Adha
  '2025-06-07', // Cuti bersama Idul Adha
  '2025-06-27', // Tahun Baru Islam
  '2025-08-17', // Kemerdekaan
  '2025-09-05', // Maulid Nabi
  '2025-12-25', // Natal
  '2025-12-26', // Cuti bersama Natal

  // --- 2026 ---
  '2026-01-01', // Tahun Baru
  '2026-01-16', // Isra Mi'raj
  '2026-03-19', // Cuti bersama Idul Fitri
  '2026-03-20', // Idul Fitri
  '2026-03-21', // Idul Fitri
  '2026-03-23', // Cuti bersama Idul Fitri
  '2026-03-24', // Cuti bersama Idul Fitri
  '2026-04-03', // Wafat Isa Almasih
  '2026-05-01', // Hari Buruh
  '2026-05-14', // Kenaikan Isa Almasih
  '2026-05-27', // Idul Adha
  '2026-05-28', // Cuti bersama Idul Adha
  '2026-05-31', // Waisak
  '2026-06-01', // Hari Pancasila
  '2026-06-17', // Tahun Baru Islam
  '2026-08-17', // Kemerdekaan
  '2026-08-26', // Maulid Nabi
  '2026-12-25', // Natal

  // --- 2027 ---
  '2027-01-01', // Tahun Baru
  '2027-01-05', // Isra Mi'raj
  '2027-03-08', // Cuti bersama Idul Fitri
  '2027-03-09', // Idul Fitri
  '2027-03-10', // Idul Fitri
  '2027-03-11', // Cuti bersama Idul Fitri
  '2027-03-12', // Cuti bersama Idul Fitri
  '2027-03-26', // Wafat Isa Almasih
  '2027-05-01', // Hari Buruh
  '2027-05-13', // Kenaikan Isa Almasih
  '2027-05-16', // Idul Adha
  '2027-05-17', // Cuti bersama Idul Adha
  '2027-05-20', // Waisak
  '2027-06-01', // Hari Pancasila
  '2027-06-07', // Tahun Baru Islam
  '2027-08-17', // Kemerdekaan
  '2027-08-16', // Maulid Nabi
  '2027-12-25', // Natal
]);

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isIndonesianNationalHoliday(y: number, m: number, d: number): boolean {
  return INDONESIA_NATIONAL_HOLIDAYS.has(toIsoDate(y, m, d));
}
