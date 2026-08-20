import { NextRequest } from 'next/server';
import { requireGaAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { listGaStockItems, parseGaStockListFilters } from '@/lib/ga/listStockItems';

export async function GET(req: NextRequest) {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);

  const filters = parseGaStockListFilters(new URL(req.url).searchParams);
  const result = await listGaStockItems(filters);
  return ok(result);
}
