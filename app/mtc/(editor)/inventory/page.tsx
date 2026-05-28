import { Suspense } from 'react';
import StockViewer from '@/components/shared/StockViewer';

function InventoryFallback() {
  return (
    <>
      <div className="page-header">
        <div className="page-title">Stock Inventory</div>
        <div className="page-sub">Memuat data stok…</div>
      </div>
      <div className="page-body">
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tx3)' }}>Memuat…</div>
      </div>
    </>
  );
}

export default function EditorInventoryPage() {
  return (
    <Suspense fallback={<InventoryFallback />}>
      <StockViewer />
    </Suspense>
  );
}
