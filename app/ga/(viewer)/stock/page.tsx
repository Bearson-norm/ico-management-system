import { Suspense } from 'react';
import StockViewer from '@/components/shared/StockViewer';

function GaStockFallback() {
  return (
    <>
      <div className="page-header">
        <div className="page-title">Stok & Lokasi</div>
        <div className="page-sub">Memuat data stok…</div>
      </div>
      <div className="page-body">
        <div className="ga-loading" style={{ padding: 48 }}>Memuat…</div>
      </div>
    </>
  );
}

export default function GaStockPage() {
  return (
    <Suspense fallback={<GaStockFallback />}>
      <StockViewer stockApiUrl="/api/ga/stock" />
    </Suspense>
  );
}
