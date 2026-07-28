/** Parts tanggal di zona Asia/Jakarta */
export function getJakartaYmd(date: Date = new Date()): { y: number; m: number; d: number } {
  const s = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** Waktu Asia/Jakarta sebagai Instant UTC */
export function jakartaDateTime(y: number, m: number, d: number, h = 0, min = 0, sec = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sec)}+07:00`);
}
