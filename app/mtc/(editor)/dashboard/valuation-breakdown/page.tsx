import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ValuationBreakdownTable from './ValuationBreakdownTable';

export const metadata = {
  title: 'Breakdown Nilai Aset Stok MTC',
  description: 'Daftar rincian nilai aset persediaan suku cadang MTC.',
};

export default async function ValuationBreakdownPage() {
  // Fetch all active spareparts and their movements on the server
  const allSpareparts = await prisma.sparepart.findMany({
    where: { aktif: true },
    select: {
      id: true,
      nama: true,
      harga: true,
      uom: true,
      lokasi: true,
      movements: {
        where: {
          tipe: { in: ['IN', 'OUT'] },
          OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
        },
        select: { tipe: true, qty: true },
      },
    },
  });

  // Calculate stocks and valuations
  const sparepartsValuation = allSpareparts.map((sp) => {
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;
    const price = Number(sp.harga || 0);
    const valuation = currentStock > 0 ? currentStock * price : 0;

    return {
      id: sp.id,
      nama: sp.nama,
      uom: sp.uom,
      lokasi: sp.lokasi || '-',
      currentStock,
      price,
      valuation,
    };
  });

  // Filter only items with positive stock and valuation, sorted descending
  const activeValuations = sparepartsValuation
    .filter((sp) => sp.valuation > 0)
    .sort((a, b) => b.valuation - a.valuation);

  const totalStockValuation = activeValuations.reduce((sum, sp) => sum + sp.valuation, 0);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/mtc/dashboard" className="btn btn-ghost btn-sm" style={{ padding: '6px 12px' }}>
            ← Kembali ke Dashboard
          </Link>
          <div>
            <div className="page-title" style={{ fontSize: 22 }}>Breakdown Nilai Aset Stok (Inventory)</div>
            <div className="page-sub">Rincian nilai aset persediaan berdasarkan Stok Aktif × Harga Master</div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Summary Card */}
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(62,181,116,0.06) 0%, rgba(19,19,26,0.65) 100%)',
          border: '1px solid var(--grn-b)',
          borderLeft: '4px solid var(--grn)',
          padding: '20px 24px',
          marginBottom: 24,
          borderRadius: 'var(--r)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grn)' }}>
            TOTAL NILAI ASET STOK SAAT INI
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--tx)', marginTop: 8 }}>
            {new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(totalStockValuation)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 8 }}>
            Terdiri dari {activeValuations.length} item suku cadang aktif yang memiliki stok fisik.
          </div>
        </div>

        {/* Client Table Component with Search and Pagination */}
        <ValuationBreakdownTable initialItems={activeValuations} />
      </div>
    </>
  );
}
