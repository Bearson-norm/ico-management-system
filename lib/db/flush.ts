import type { PrismaClient as MtcPrisma } from '../generated/mtc';
import type { PrismaClient as GaPrisma } from '../generated/ga';

export type FlushMtcOptions = {
  /** Jika true, baris `users` tidak dihapus (login admin tetap ada). */
  keepUsers?: boolean;
};

export type FlushGaOptions = {
  keepUsers?: boolean;
};

/** Kosongkan semua data transaksi & master MTC (urutan aman untuk FK). */
export async function flushMtcDatabase(
  prisma: MtcPrisma,
  options: FlushMtcOptions = {}
): Promise<void> {
  const { keepUsers = false } = options;

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany();
    await tx.maintenanceReport.deleteMany();
    await tx.sparepart.deleteMany();
    await tx.mesin.deleteMany();
    await tx.teknisi.deleteMany();
    await tx.kategori.deleteMany();
    await tx.reportCounter.deleteMany();
    if (!keepUsers) {
      await tx.user.deleteMany();
    }
  });
}

/** Kosongkan semua data GA (termasuk opname jika ada). */
export async function flushGaDatabase(
  prisma: GaPrisma,
  options: FlushGaOptions = {}
): Promise<void> {
  const { keepUsers = false } = options;

  await prisma.$transaction(async (tx) => {
    await tx.gaOpnameLine.deleteMany();
    await tx.gaOpnameSession.deleteMany();
    await tx.gaStockMovement.deleteMany();
    await tx.gaItem.deleteMany();
    await tx.kategori.deleteMany();
    if (!keepUsers) {
      await tx.user.deleteMany();
    }
  });
}
