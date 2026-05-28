import { PrismaClient } from '@/lib/generated/mtc';

declare global {
  // eslint-disable-next-line no-var
  var prismaMtc: PrismaClient | undefined;
}

export const prisma =
  global.prismaMtc ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaMtc = prisma;
}
