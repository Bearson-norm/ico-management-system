'use client';
import { useState } from 'react';

export default function ProcurementSelect({
  itemId,
  initialStatus,
  onUpdate,
}: {
  itemId: string;
  initialStatus: string;
  onUpdate?: () => void;
}) {
  const [status, setStatus] = useState(initialStatus || 'NONE');
  const [loading, setLoading] = useState(false);

  const handleChange = async (newVal: string) => {
    setLoading(true);
    setStatus(newVal);
    try {
      const res = await fetch('/api/mtc/master/sparepart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, purchasingStatus: newVal }),
      });
      if (res.ok) {
        if (onUpdate) onUpdate();
        else window.location.reload(); // Quick refresh for Server Components (Dashboard)
      } else {
        alert('Gagal memperbarui status pengadaan');
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      className="form-input form-select"
      style={{
        padding: '4px 8px',
        fontSize: '11px',
        height: '26px',
        width: 'auto',
        minWidth: '100px',
        borderRadius: '6px',
        background: 'var(--sf3)',
        color: 'var(--tx)',
        borderColor: 'var(--br)',
        cursor: 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
      disabled={loading}
      value={status}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="NONE">— Normal —</option>
      <option value="PR">⏳ Sedang PR</option>
      <option value="PO">📦 Sudah PO</option>
    </select>
  );
}
