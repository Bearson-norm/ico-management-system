import React from 'react';
import { TrackingItem } from '@/types/mtc/procurement';

type ReceiveModalProps = {
  showReceiveModal: boolean;
  setShowReceiveModal: (val: boolean) => void;
  receivingItem: TrackingItem | null;
  receiveDate: string;
  setReceiveDate: (val: string) => void;
  receivePrice: number;
  setReceivePrice: (val: number) => void;
  receiveVendor: string;
  setReceiveVendor: (val: string) => void;
  receiveQty: number;
  setReceiveQty: (val: number) => void;
  isStocked: boolean;
  setIsStocked: (val: boolean) => void;
  handleReceiveSubmit: (e: React.FormEvent) => void;
  actionLoading: string | null;
};

export const ReceiveModal: React.FC<ReceiveModalProps> = ({
  showReceiveModal,
  setShowReceiveModal,
  receivingItem,
  receiveDate,
  setReceiveDate,
  receivePrice,
  setReceivePrice,
  receiveVendor,
  setReceiveVendor,
  receiveQty,
  setReceiveQty,
  isStocked,
  setIsStocked,
  handleReceiveSubmit,
  actionLoading,
}) => {
  if (!showReceiveModal || !receivingItem) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--sf2)',
          border: '1px solid var(--grn)',
          borderRadius: 12,
        }}
      >
        <div
          className="card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--br)',
          }}
        >
          <div className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--grn)', margin: 0 }}>
            📥 Pencatatan Penerimaan Barang (Goods Receipt / GR)
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowReceiveModal(false)}
            style={{ fontSize: 16, cursor: 'pointer' }}
          >
            ✖
          </button>
        </div>

        <form onSubmit={handleReceiveSubmit} style={{ padding: 20 }}>
          <div
            style={{
              padding: 12,
              background: 'var(--sf3)',
              borderRadius: 8,
              marginBottom: 16,
              border: '1px solid var(--br)',
              fontSize: 11,
            }}
          >
            <div style={{ color: 'var(--tx3)' }}>Barang Diterima:</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--tx)', marginTop: 2 }}>
              {receivingItem.originalName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
              PR: {receivingItem.nomorPr || '—'} · PO: {receivingItem.nomorPo || '—'} · Total Qty Pesanan: <strong>{receivingItem.qty} Pcs</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Tanggal Penerimaan Fisik <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="date"
                className="form-input"
                required
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Qty Diterima <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                {receiveQty < receivingItem.qty && (
                  <span style={{ fontSize: 9.5, color: '#f59e0b', fontWeight: 700 }}>
                    Parsial ({receiveQty}/{receivingItem.qty})
                  </span>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={receivingItem.qty}
                className="form-input"
                required
                value={receiveQty}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(receivingItem.qty, Number(e.target.value) || 1));
                  setReceiveQty(val);
                }}
              />
              {receivingItem.qty > 1 && receiveQty < receivingItem.qty && (
                <div style={{ marginTop: 3, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => setReceiveQty(receivingItem.qty)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--blu)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    Terima Semua ({receivingItem.qty} Pcs)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Alert jika Penerimaan Parsial (Sebagian) */}
          {receiveQty < receivingItem.qty && (
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 11,
                color: '#fcd34d',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <strong>Penerimaan Sebagian (Partial Receipt):</strong>
                <div style={{ fontSize: 10.5, marginTop: 2, color: 'rgba(255,255,255,0.85)' }}>
                  Sebanyak <strong>{receiveQty} Pcs</strong> dicatat tiba hari ini. Sisa <strong>{receivingItem.qty - receiveQty} Pcs</strong> otomatis tetap aktif di daftar PO menunggu sisa barang tiba.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Harga Satuan Final (Rp)
              </label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={receivePrice}
                onChange={(e) => setReceivePrice(Number(e.target.value) || 0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Vendor Pembuat PO
              </label>
              <input
                type="text"
                className="form-input"
                value={receiveVendor}
                onChange={(e) => setReceiveVendor(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, display: 'block' }}>
              Tujuan Akhir Penerimaan
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={`btn ${isStocked ? 'btn-grn' : 'btn-ghost'}`}
                onClick={() => setIsStocked(true)}
                style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 700 }}
              >
                📦 Masuk Stok Gudang
              </button>
              <button
                type="button"
                className={`btn ${!isStocked ? 'btn-pur' : 'btn-ghost'}`}
                onClick={() => setIsStocked(false)}
                style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 700 }}
              >
                ⚡ Langsung Pakai
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowReceiveModal(false)}>
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-grn"
              disabled={actionLoading !== null}
              style={{ fontWeight: 800, padding: '0 20px', height: 36, cursor: 'pointer' }}
            >
              📥 Simpan Penerimaan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
