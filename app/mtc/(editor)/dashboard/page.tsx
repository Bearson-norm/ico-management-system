import { prisma } from '@/lib/prisma';
import Link from 'next/link';


function fmtRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export default async function DashboardPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalReportHariIni, recentMovements] = await Promise.all([
    prisma.maintenanceReport.count({ where: { tanggal: { gte: today } } }),
    prisma.stockMovement.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { pic: true },
    }),
  ]);

  const allSpareparts = await prisma.sparepart.findMany({
    where: { aktif: true },
    select: {
      id: true,
      nama: true,
      minQty: true,
      maxLeadTime: true,
      avgLeadTime: true,
      uom: true,
      lokasi: true,
      purchasingStatus: true,
      purchasingQty: true,
      harga: true,
      movements: {
        where: { tipe: { in: ['IN', 'OUT'] } },
        select: { tipe: true, qty: true, tanggal: true },
      },
    },
  });

  const sparepartsWithStock = allSpareparts.map((sp) => {
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const outMovements = sp.movements.filter((m) => m.tipe === 'OUT');
    const totalOut = outMovements.reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;

    const usageByDate: Record<string, number> = {};
    outMovements.forEach((m) => {
      const dateStr = new Date(m.tanggal).toISOString().split('T')[0];
      usageByDate[dateStr] = (usageByDate[dateStr] || 0) + m.qty;
    });
    const dailyUsages = Object.values(usageByDate);
    const maxDailyUsage = dailyUsages.length > 0 ? Math.max(...dailyUsages) : 0;
    const avgDailyUsage = totalOut / 30;

    let calculatedSafetyStock = 0;
    let isAuto = false;
    if (sp.maxLeadTime > 0 && sp.avgLeadTime > 0) {
      calculatedSafetyStock = Math.round(
        maxDailyUsage * sp.maxLeadTime - avgDailyUsage * sp.avgLeadTime
      );
      if (calculatedSafetyStock < 0) calculatedSafetyStock = 0;
      isAuto = true;
    }

    const limitStock = isAuto ? calculatedSafetyStock : sp.minQty;

    return {
      id: sp.id,
      nama: sp.nama,
      minQty: sp.minQty,
      maxLeadTime: sp.maxLeadTime,
      avgLeadTime: sp.avgLeadTime,
      calculatedSafetyStock,
      isAuto,
      limitStock,
      uom: sp.uom,
      lokasi: sp.lokasi,
      currentStock,
      purchasingStatus: sp.purchasingStatus,
      purchasingQty: sp.purchasingQty,
      harga: Number(sp.harga || 0),
    };
  });

  const totalStockValuation = sparepartsWithStock.reduce(
    (sum, sp) => sum + (sp.currentStock > 0 ? sp.currentStock * sp.harga : 0),
    0
  );

  const totalLogAggregation = await prisma.stockMovement.aggregate({
    where: { tipe: 'LOG' },
    _sum: { harga: true },
  });
  const totalOnetimeValuation = Number(totalLogAggregation._sum.harga || 0);

  const lowStockItems = sparepartsWithStock
    .filter((sp) => sp.currentStock <= sp.limitStock)
    .sort((a, b) => a.currentStock - b.currentStock)
    .slice(0, 5);

  const totalKritisCount = sparepartsWithStock.filter(
    (sp) => sp.currentStock <= sp.limitStock
  ).length;

  const totalPRCount = sparepartsWithStock.filter((sp) => sp.purchasingStatus === 'PR').length;
  const totalPOCount = sparepartsWithStock.filter((sp) => sp.purchasingStatus === 'PO').length;

  const prItems = sparepartsWithStock.filter((sp) => sp.purchasingStatus === 'PR');
  const poItems = sparepartsWithStock.filter((sp) => sp.purchasingStatus === 'PO');

  const totalPrEstimasi = prItems.reduce((sum, item) => sum + (item.harga * (item.purchasingQty || 1)), 0);
  const totalPoEstimasi = poItems.reduce((sum, item) => sum + (item.harga * (item.purchasingQty || 1)), 0);

  const topUsedMovements = await prisma.stockMovement.groupBy({
    by: ['sparepartId', 'namaItem'],
    where: { tipe: 'OUT', NOT: { sparepartId: null } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: 'desc' } },
    take: 5,
  });

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard Overview</div>
        <div className="page-sub">Ringkasan aktivitas hari ini & pemantauan stok kritis</div>
      </div>

      <div className="page-body">
        {/* ==================== SECTION: RINGKASAN NILAI ASET (VALUATION OVERVIEW) ==================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            📊 Ringkasan Nilai Aset MTC
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 0 }}>
            <div className="stat-card" style={{
              background: 'linear-gradient(135deg, rgba(62,181,116,0.08) 0%, rgba(19,19,26,0.65) 100%)',
              border: '1px solid var(--grn-b)',
              borderLeft: '4px solid var(--grn)',
              boxShadow: 'var(--shadow)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              borderRadius: 'var(--r)'
            }}>
              <div>
                <div className="stat-label" style={{ color: 'var(--grn)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <span>📦</span> Total Nilai Aset Stok (Inventory)
                </div>
                <div className="stat-value" style={{ color: 'var(--tx)', marginTop: 12, fontSize: 26, letterSpacing: '-0.5px' }}>
                  {fmtRupiah(totalStockValuation)}
                </div>
              </div>
              <div className="stat-sub" style={{ color: 'var(--tx2)', marginTop: 16, fontSize: 12 }}>
                Dihitung dari: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Stok Aktif × Harga Master</span>
              </div>
            </div>

            <div className="stat-card" style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(19,19,26,0.65) 100%)',
              border: '1px solid var(--pur-b)',
              borderLeft: '4px solid var(--pur)',
              boxShadow: 'var(--shadow)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              borderRadius: 'var(--r)'
            }}>
              <div>
                <div className="stat-label" style={{ color: 'var(--pur)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <span>📝</span> Total Pembelian Sekali Pakai (Log)
                </div>
                <div className="stat-value" style={{ color: 'var(--tx)', marginTop: 12, fontSize: 26, letterSpacing: '-0.5px' }}>
                  {fmtRupiah(totalOnetimeValuation)}
                </div>
              </div>
              <div className="stat-sub" style={{ color: 'var(--tx2)', marginTop: 16, fontSize: 12 }}>
                Dihitung dari: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Akumulasi Transaksi Non-Stok</span>
              </div>
            </div>
          </div>
        </div>

        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card stat-pur">
            <div className="stat-label">Report Hari Ini</div>
            <div className="stat-value">{totalReportHariIni}</div>
            <div className="stat-sub">Maintenance dikerjakan</div>
          </div>
          <div className="stat-card stat-blu">
            <div className="stat-label">Total Item Master</div>
            <div className="stat-value">{allSpareparts.length}</div>
            <div className="stat-sub">Item aktif terdaftar</div>
          </div>
          <Link
            href="/mtc/inventory?status=kritis"
            className="stat-card stat-ylw stat-card--link"
            aria-label={`${totalKritisCount} stok perlu restock — lihat daftar kritis`}
          >
            <div className="stat-label">Stok Perlu Restock</div>
            <div
              className="stat-value"
              style={{ color: totalKritisCount > 0 ? 'var(--red)' : 'inherit' }}
            >
              {totalKritisCount}
            </div>
            <div className="stat-sub">
              Di bawah safety stock · <span className="stat-card__cta">Lihat daftar →</span>
            </div>
          </Link>
          <Link
            href="/mtc/po-pr"
            className="stat-card stat-ylw stat-card--link"
            aria-label={`${totalPRCount} sedang di-PR — kelola pengadaan`}
          >
            <div className="stat-label">Sedang di-PR</div>
            <div className="stat-value" style={{ color: 'var(--ylw)' }}>{totalPRCount}</div>
            <div className="stat-sub">
              Estimasi: <span style={{ fontWeight: 700 }}>{fmtRupiah(totalPrEstimasi)}</span>
            </div>
          </Link>
          <Link
            href="/mtc/po-pr"
            className="stat-card stat-blu stat-card--link"
            aria-label={`${totalPOCount} sudah jadi PO — kelola pengadaan`}
          >
            <div className="stat-label">Sudah jadi PO</div>
            <div className="stat-value" style={{ color: 'var(--blu)' }}>{totalPOCount}</div>
            <div className="stat-sub">
              Estimasi: <span style={{ fontWeight: 700 }}>{fmtRupiah(totalPoEstimasi)}</span>
            </div>
          </Link>
        </div>

        <div className="form-grid-2" style={{ marginBottom: 24, gap: 20 }}>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--red)' }}>
                🚨 Barang Perlu Restock (Kritis)
              </div>
              <div className="gap-8" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-red">{totalKritisCount} Item</span>
                {totalKritisCount > 0 && (
                  <Link href="/mtc/inventory?status=kritis" className="btn btn-ghost btn-sm">
                    Lihat Semua
                  </Link>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SLOC</th>
                    <th>Stok Saat Ini</th>
                    <th>Batas Peringatan</th>
                    <th style={{ textAlign: 'center' }}>Status Pengadaan</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((sp) => (
                    <tr key={sp.id}>
                      <td style={{ fontWeight: 600 }}>
                        <div>{sp.nama}</div>
                        <span className="text-muted text-tiny">{sp.id}</span>
                      </td>
                      <td>
                        <span className="badge badge-blu" style={{ fontSize: 10 }}>
                          {sp.lokasi || '—'}
                        </span>
                      </td>
                      <td
                        style={{
                          fontWeight: 700,
                          color: sp.currentStock === 0 ? 'var(--red)' : 'var(--ylw)',
                        }}
                      >
                        {sp.currentStock} {sp.uom}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {sp.limitStock} {sp.uom}
                        </span>
                        {sp.isAuto ? (
                          <div
                            className="text-tiny"
                            style={{ color: 'var(--pur)', fontSize: 9, marginTop: 2 }}
                          >
                            Auto Safety Stock
                          </div>
                        ) : (
                          <div className="text-tiny text-muted" style={{ fontSize: 9, marginTop: 2 }}>
                            Manual Min
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {sp.purchasingStatus === 'PR' && (
                          <span className="badge badge-ylw">⏳ Sedang PR</span>
                        )}
                        {sp.purchasingStatus === 'PO' && (
                          <span className="badge badge-blu">📦 Sudah PO</span>
                        )}
                        {(!sp.purchasingStatus || sp.purchasingStatus === 'NONE') && (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {lowStockItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--tx3)' }}>
                        Stok aman! Tidak ada barang kritis.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--pur)' }}>
                🔥 Pemakaian Tertinggi (Top 5)
              </div>
            </div>
            <div className="table-wrap">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>Nama Barang</th>
                    <th>ID Barang</th>
                    <th style={{ textAlign: 'right' }}>Total Dipakai</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsedMovements.map((m) => (
                    <tr key={m.sparepartId}>
                      <td style={{ fontWeight: 600 }}>{m.namaItem}</td>
                      <td className="text-mono text-muted text-tiny">{m.sparepartId}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--pur)' }}>
                        {m._sum.qty} Pcs
                      </td>
                    </tr>
                  ))}
                  {topUsedMovements.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--tx3)' }}>
                        Belum ada data pemakaian barang.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">📝 Status Pengadaan Terkini (PR / PO)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge badge-ylw">{totalPRCount} Sedang PR</span>
              <span className="badge badge-blu">{totalPOCount} Sudah PO</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Nama Barang</th>
                  <th>SLOC</th>
                  <th>Stok Saat Ini</th>
                  <th>Status Pengadaan</th>
                </tr>
              </thead>
              <tbody>
                {[...prItems, ...poItems].map((sp) => (
                  <tr key={sp.id}>
                    <td className="text-mono text-tiny text-muted">{sp.id}</td>
                    <td style={{ fontWeight: 600 }}>{sp.nama}</td>
                    <td>
                      <span className="badge badge-blu" style={{ fontSize: 10 }}>
                        {sp.lokasi || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {sp.currentStock} {sp.uom}
                    </td>
                    <td>
                      {sp.purchasingStatus === 'PR' && (
                        <span className="badge badge-ylw">⏳ Sedang PR</span>
                      )}
                      {sp.purchasingStatus === 'PO' && (
                        <span className="badge badge-blu">📦 Sudah PO</span>
                      )}
                    </td>
                  </tr>
                ))}
                {prItems.length === 0 && poItems.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--tx3)' }}>
                      Tidak ada barang yang sedang dalam proses pengadaan (PR/PO).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Pergerakan Stok Terakhir</div>
            <Link href="/mtc/history" className="btn btn-ghost btn-sm">
              Lihat Semua
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Tipe</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>PIC</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted text-tiny">
                      {new Date(m.createdAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      {m.tipe === 'IN' && <span className="badge badge-grn">IN</span>}
                      {m.tipe === 'OUT' && <span className="badge badge-ylw">OUT</span>}
                      {m.tipe === 'LOG' && <span className="badge badge-pur">LOG</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{m.namaItem}</td>
                    <td style={{ fontWeight: 700 }}>{m.qty}</td>
                    <td>{m.pic?.nama || '—'}</td>
                    <td className="text-muted text-tiny">{m.noReport || m.keterangan || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
