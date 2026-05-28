import type { PrismaClient } from '@/lib/generated/ga';

export async function generateGaItemId(prisma: PrismaClient): Promise<string> {
  const last = await prisma.gaItem.findFirst({
    where: { id: { startsWith: 'GA-SP-' } },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (!last) return 'GA-SP-001';
  const num = parseInt(last.id.replace('GA-SP-', ''), 10) + 1;
  return 'GA-SP-' + String(num).padStart(3, '0');
}
