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
  isPackMode: boolean;
  setIsPackMode: (val: boolean) => void;
  qtyPerPack: number;
  setQtyPerPack: (val: number) => void;
  uomPack: string;
  setUomPack: (val: string) => void;
  uomUnit: string;
  setUomUnit: (val: string) => void;
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
  isPackMode,
  setIsPackMode,
  qtyPerPack,
  setQtyPerPack,
  uomPack,
  setUomPack,
  uomUnit,
  setUomUnit,
  handleReceiveSubmit,
  actionLoading,
}) => {
  if (!showReceiveModal || !receivingItem) return null;

  let isAlreadyInUnits = false;
  if (receivingItem.linkedPartsJson) {
    try {
      const meta = JSON.parse(receivingItem.linkedPartsJson);
      if (meta && (meta.isConvertedToUnits || meta.originalPackQty !== undefined)) {
        isAlreadyInUnits = true;
      }
    } catch {}
  }

  const multiplier = isPackMode && !isAlreadyInUnits && Number(qtyPerPack) > 1 ? Number(qtyPerPack) : 1;
  const totalPhysicalUnits = receivingItem.qty * multiplier;
  const unitPrice = multiplier > 1 ? Math.round((receivePrice || 0) / multiplier) : (receivePrice || 0);

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
          maxWidth: 540,
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
              marginBottom: 14,
              border: '1px solid var(--br)',
              fontSize: 11,
            }}
          >
            <div style={{ color: 'var(--tx3)' }}>Barang Diterima:</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--tx)', marginTop: 2 }}>
              {receivingItem.originalName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
              PR: {receivingItem.nomorPr || '—'} · PO: {receivingItem.nomorPo || '—'} · Dokumen Pesanan: <strong>{receivingItem.qty} {isPackMode ? uomPack : 'Pcs'}</strong>
            </div>
          </div>

          {/* Mode Satuan Pembelian (Satuan Biasa vs Kemasan Pack/Box) */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, display: 'block' }}>
              Mode Satuan Pembelian
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className={`btn ${!isPackMode ? 'btn-blu' : 'btn-ghost'}`}
                onClick={() => {
                  setIsPackMode(false);
                  setReceiveQty(receivingItem.qty);
                }}
                style={{ height: 34, fontSize: 11, fontWeight: 700 }}
              >
                🔩 Satuan Biasa (Unit/Pcs)
              </button>
              <button
                type="button"
                className={`btn ${isPackMode ? 'btn-blu' : 'btn-ghost'}`}
                onClick={() => {
                  setIsPackMode(true);
                  const mult = Math.max(1, qtyPerPack || 1);
                  setReceiveQty(receivingItem.qty * mult);
                }}
                style={{ height: 34, fontSize: 11, fontWeight: 700 }}
              >
                📦 Kemasan (Pack/Box/Set)
              </button>
            </div>
          </div>

          {/* Konfigurasi Kemasan jika mode Pack aktif */}
          {isPackMode && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 11.5, color: 'var(--blu)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📐</span> Konversi Kemasan ke Unit Fisik
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
                    Satuan Kemasan
                  </label>
                  <select
                    className="form-input"
                    style={{ height: 32, fontSize: 11 }}
                    value={uomPack}
                    onChange={(e) => setUomPack(e.target.value)}
                  >
                    <option value="Pack">Pack</option>
                    <option value="Box">Box</option>
                    <option value="Set">Set</option>
                    <option value="Sak">Sak</option>
                    <option value="Roll">Roll</option>
                    <option value="Pallet">Pallet</option>
                    <option value="Lusin">Lusin</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
                    1 {uomPack} isi berapa? <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    style={{ height: 32, fontSize: 11 }}
                    value={qtyPerPack}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setQtyPerPack(val);
                      setReceiveQty(receivingItem.qty * val);
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
                    Satuan Unit Fisik
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ height: 32, fontSize: 11 }}
                    value={uomUnit}
                    onChange={(e) => setUomUnit(e.target.value)}
                    placeholder="Pcs"
                  />
                </div>
              </div>

              {/* Live Calculator Summary */}
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: 'var(--sf3)',
                  borderRadius: 6,
                  fontSize: 10.5,
                  border: '1px solid var(--br)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: 'var(--tx2)' }}>
                  Pesanan Dokumen: <strong>{receivingItem.qty} {uomPack}</strong> × {multiplier} = <strong>{totalPhysicalUnits} {uomUnit}</strong> fisik.
                </div>
                <div style={{ color: 'var(--tx2)', marginTop: 2 }}>
                  Harga Dokumen: Rp {receivePrice.toLocaleString('id-ID')} / {uomPack} ➔ Estimasi Satuan: <strong style={{ color: 'var(--grn)' }}>Rp {unitPrice.toLocaleString('id-ID')} / {uomUnit}</strong>
                </div>
                <div style={{ color: '#38bdf8', marginTop: 2, fontWeight: 600 }}>
                  Diterima Saat Ini: {receiveQty} {uomUnit} (Total Rp {(receiveQty * unitPrice).toLocaleString('id-ID')})
                  {receiveQty < totalPhysicalUnits && (
                    <span style={{ color: '#f59e0b', marginLeft: 6 }}>
                      | Sisa: {totalPhysicalUnits - receiveQty} {uomUnit} (Rp {((totalPhysicalUnits - receiveQty) * unitPrice).toLocaleString('id-ID')})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

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
                  Qty Diterima ({isPackMode ? uomUnit : 'Pcs'}) <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                {receiveQty < totalPhysicalUnits && (
                  <span style={{ fontSize: 9.5, color: '#f59e0b', fontWeight: 700 }}>
                    Parsial ({receiveQty}/{totalPhysicalUnits})
                  </span>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={totalPhysicalUnits}
                className="form-input"
                required
                value={receiveQty}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(totalPhysicalUnits, Number(e.target.value) || 1));
                  setReceiveQty(val);
                }}
              />
              {totalPhysicalUnits > 1 && receiveQty < totalPhysicalUnits && (
                <div style={{ marginTop: 3, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => setReceiveQty(totalPhysicalUnits)}
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
                    Terima Semua ({totalPhysicalUnits} {isPackMode ? uomUnit : 'Pcs'})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Alert jika Penerimaan Parsial (Sebagian) */}
          {receiveQty < totalPhysicalUnits && (
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
                  Sebanyak <strong>{receiveQty} {isPackMode ? uomUnit : 'Pcs'}</strong> dicatat tiba hari ini. Sisa <strong>{totalPhysicalUnits - receiveQty} {isPackMode ? uomUnit : 'Pcs'}</strong> otomatis tetap aktif di daftar PO menunggu sisa barang tiba.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                {isPackMode ? `Harga Dokumen PO (per ${uomPack})` : 'Harga Satuan Final (Rp)'}
              </label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={receivePrice}
                onChange={(e) => setReceivePrice(Number(e.target.value) || 0)}
              />
              {isPackMode && multiplier > 1 && (
                <div style={{ fontSize: 10, color: 'var(--grn)', marginTop: 3 }}>
                  = Rp {unitPrice.toLocaleString('id-ID')} / {uomUnit} (yang masuk ke kartu stok)
                </div>
              )}
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
