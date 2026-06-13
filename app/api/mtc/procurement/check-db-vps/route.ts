import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const items = await prisma.procurementTracking.findMany({
      where: {
        OR: [
          { nomorPo: 'P13732' },
          { nomorPr: 'PR04104' }
        ]
      },
      include: {
        sparepart: true
      }
    });
    return NextResponse.json({ success: true, items });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
