import { PrismaClient } from '@/lib/generated/ga';

declare global {
  // eslint-disable-next-line no-var
  var prismaGa: PrismaClient | undefined;
}

export const prismaGa =
  global.prismaGa ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGa = prismaGa;
}
