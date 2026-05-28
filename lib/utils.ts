/** Hitung durasi dalam menit, handle overnight shift */
export function calcDurasiMenit(start: string, finish: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [fh, fm] = finish.split(':').map(Number);
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins < 0) mins += 1440; // overnight
  return mins;
}

import type { PrismaClient, Prisma } from '@/lib/generated/mtc';

/** Generate no_report dalam transaksi — race-condition free */
export async function generateNoReport(
  prisma: PrismaClient | Prisma.TransactionClient,
  tipe: 'CM' | 'PM' | 'OH'
): Promise<string> {
  // Atomic increment menggunakan SELECT ... FOR UPDATE
  const updated = await prisma.$executeRaw`
    UPDATE report_counter SET count = count + 1 WHERE tipe = ${tipe}
  `;
  if (updated === 0) throw new Error(`Counter untuk tipe ${tipe} tidak ditemukan`);

  const counter = await prisma.reportCounter.findUnique({ where: { tipe } });
  if (!counter) throw new Error('Counter tidak ditemukan');

  return `MTC-${tipe}-${String(counter.count).padStart(3, '0')}`;
}

/** Generate Item ID baru untuk sparepart */
export async function generateItemId(prisma: PrismaClient): Promise<string> {
  const last = await prisma.sparepart.findFirst({
    where: { id: { startsWith: 'MTC-SP-' } },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  if (!last) return 'MTC-SP-001';
  const num = parseInt(last.id.replace('MTC-SP-', '')) + 1;
  return 'MTC-SP-' + String(num).padStart(3, '0');
}

/** Format tanggal ISO ke lokal Indonesia */
export function fmtTanggal(d: Date | string): string {
  return new Date(d).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Response helper */
export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}
export function err(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}
