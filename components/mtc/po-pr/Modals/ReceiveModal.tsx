import React, { useEffect, useId } from 'react';
import { TrackingItem } from '@/types/mtc/procurement';
import { BundlePartInput, ReceiveMode } from '@/lib/mtc/bundle-receive';
import { SplitReceiveSection } from './SplitReceiveSection';

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
  receiveMode: ReceiveMode;
  setReceiveMode: (val: ReceiveMode) => void;
  receiveParts: BundlePartInput[];
  setReceiveParts: React.Dispatch<React.SetStateAction<BundlePartInput[]>>;
  dbCategories: { id: number; nama: string; tipe: string }[];
  onSparepartCreated?: () => void;
  splitError?: string | null;
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
  receiveMode,
  setReceiveMode,
  receiveParts,
  setReceiveParts,
  dbCategories,
  onSparepartCreated,
  splitError,
  handleReceiveSubmit,
  actionLoading,
}) => {
  const formIdPrefix = useId();

  useEffect(() => {
    if (!showReceiveModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowReceiveModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReceiveModal, setShowReceiveModal]);

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

  const isSplitMode = receiveMode === 'split';
  const packActive = receiveMode === 'pack' || (isPackMode && receiveMode !== 'split');
  const multiplier = packActive && !isAlreadyInUnits && Number(qtyPerPack) > 1 ? Number(qtyPerPack) : 1;
  const totalPhysicalUnits = receivingItem.qty * multiplier;
  const unitPrice = multiplier > 1 ? Math.round((receivePrice || 0) / multiplier) : (receivePrice || 0);
  const canStockSingleItem = Boolean(receivingItem.sparepartId);
  const canSelectStockDestination = isSplitMode || canStockSingleItem;

  const uomPackId = `${formIdPrefix}-uom-pack`;
  const qtyPerPackId = `${formIdPrefix}-qty-per-pack`;
  const uomUnitId = `${formIdPrefix}-uom-unit`;
  const receiveDateId = `${formIdPrefix}-receive-date`;
  const receiveQtyId = `${formIdPrefix}-receive-qty`;
  const receivePriceId = `${formIdPrefix}-receive-price`;
  const receiveVendorId = `${formIdPrefix}-receive-vendor`;

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-modal-title"
        className="card receive-modal-card"
        style={{
          maxWidth: isSplitMode ? 820 : 540,
          borderColor: 'var(--grn)',
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
            gap: 12,
          }}
        >
          <h2
            id="receive-modal-title"
            className="card-title"
            style={{ fontSize: 15, fontWeight: 800, color: '#4ade80', margin: 0 }}
          >
            Pencatatan Penerimaan Barang (Goods Receipt / GR)
          </h2>
          <button
            type="button"
            aria-label="Tutup modal"
            className="receive-btn-secondary receive-focusable"
            onClick={() => setShowReceiveModal(false)}
            style={{ minWidth: 44, minHeight: 44, padding: 0 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleReceiveSubmit} style={{ padding: 20 }}>
          <div
            style={{
              padding: 12,
              background: 'var(--sf3)',
              borderRadius: 8,
              marginBottom: 16,
              border: '1px solid var(--brh)',
              fontSize: 12,
            }}
          >
            <div style={{ color: 'var(--tx2)', fontSize: 11 }}>Barang Diterima:</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--tx)', marginTop: 2 }}>
              {receivingItem.originalName}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 4 }}>
              PR: {receivingItem.nomorPr || '-'} | PO: {receivingItem.nomorPo || '-'} | Dokumen Pesanan:{' '}
              <strong style={{ color: 'var(--tx)' }}>
                {receivingItem.qty} {packActive ? uomPack : 'Pcs'}
              </strong>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div
              className="form-label"
              style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)', marginBottom: 6, display: 'block' }}
            >
              Mode Penerimaan Barang
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <button
                type="button"
                aria-pressed={receiveMode === 'unit'}
                className={`receive-tab-btn receive-focusable ${receiveMode === 'unit' ? 'receive-tab-btn--active' : ''}`}
                onClick={() => {
                  setReceiveMode('unit');
                  setIsPackMode(false);
                  setReceiveQty(receivingItem.qty);
                }}
              >
                Satuan Biasa (Unit/Pcs)
              </button>
              <button
                type="button"
                aria-pressed={receiveMode === 'pack'}
                className={`receive-tab-btn receive-focusable ${receiveMode === 'pack' ? 'receive-tab-btn--active' : ''}`}
                onClick={() => {
                  setReceiveMode('pack');
                  setIsPackMode(true);
                  const mult = Math.max(1, qtyPerPack || 1);
                  setReceiveQty(receivingItem.qty * mult);
                }}
              >
                Kemasan (Pack/Box/Set)
              </button>
              <button
                type="button"
                aria-pressed={receiveMode === 'split'}
                className={`receive-tab-btn receive-focusable ${receiveMode === 'split' ? 'receive-tab-btn--active' : ''}`}
                onClick={() => {
                  setReceiveMode('split');
                  setIsPackMode(false);
                }}
              >
                Pecah Item (Multi-Item)
              </button>
            </div>
          </div>

          {receiveMode === 'pack' && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(96, 165, 250, 0.35)',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12, color: '#93c5fd', marginBottom: 8 }}>
                Konversi Kemasan ke Unit Fisik
              </div>
              <div className="receive-pack-grid">
                <div>
                  <label
                    htmlFor={uomPackId}
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
                  >
                    Satuan Kemasan
                  </label>
                  <select
                    id={uomPackId}
                    className="form-input form-select receive-focusable"
                    style={{ minHeight: 44, fontSize: 12 }}
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
                  <label
                    htmlFor={qtyPerPackId}
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
                  >
                    1 {uomPack} isi berapa? <span style={{ color: '#fca5a5' }}>*</span>
                  </label>
                  <input
                    id={qtyPerPackId}
                    type="number"
                    min="1"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44, fontSize: 12 }}
                    value={qtyPerPack}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setQtyPerPack(val);
                      setReceiveQty(receivingItem.qty * val);
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor={uomUnitId}
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
                  >
                    Satuan Unit Fisik
                  </label>
                  <input
                    id={uomUnitId}
                    type="text"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44, fontSize: 12 }}
                    value={uomUnit}
                    onChange={(e) => setUomUnit(e.target.value)}
                    placeholder="Pcs"
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: 'var(--sf3)',
                  borderRadius: 6,
                  fontSize: 11.5,
                  border: '1px solid var(--brh)',
                  lineHeight: 1.5,
                  color: 'var(--tx2)',
                }}
              >
                <div>
                  Pesanan Dokumen: <strong style={{ color: 'var(--tx)' }}>{receivingItem.qty} {uomPack}</strong> x {multiplier} ={' '}
                  <strong style={{ color: 'var(--tx)' }}>{totalPhysicalUnits} {uomUnit}</strong> fisik.
                </div>
                <div style={{ marginTop: 2 }}>
                  Harga Dokumen: Rp {receivePrice.toLocaleString('id-ID')} / {uomPack}. Estimasi Satuan:{' '}
                  <strong style={{ color: '#4ade80' }}>Rp {unitPrice.toLocaleString('id-ID')} / {uomUnit}</strong>
                </div>
                <div style={{ color: '#93c5fd', marginTop: 2, fontWeight: 600 }}>
                  Diterima Saat Ini: {receiveQty} {uomUnit} (Total Rp {(receiveQty * unitPrice).toLocaleString('id-ID')})
                  {receiveQty < totalPhysicalUnits && (
                    <span style={{ color: '#fbbf24', marginLeft: 6 }}>
                      | Sisa: {totalPhysicalUnits - receiveQty} {uomUnit} (Rp {((totalPhysicalUnits - receiveQty) * unitPrice).toLocaleString('id-ID')})
                    </span>
                  )}
                </div>
                {uomPack === 'Roll' && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      background: 'rgba(139, 92, 246, 0.14)',
                      border: '1px solid rgba(167, 139, 250, 0.35)',
                      borderRadius: 6,
                      color: '#ddd6fe',
                      fontSize: 11.5,
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Sistem Pisah Roll Aktif:</strong> Barang ini otomatis dipisah menjadi{' '}
                    <strong>{Math.floor(receiveQty / (qtyPerPack || 1))} Roll</strong> fisik (@ {qtyPerPack} {uomUnit}) di kartu stok gudang.
                  </div>
                )}
              </div>
            </div>
          )}

          {isSplitMode ? (
            <>
              <SplitReceiveSection
                poQty={receivingItem.qty || 1}
                poUnitPrice={Number(receivingItem.harga) || 0}
                parts={receiveParts}
                setParts={setReceiveParts}
                dbCategories={dbCategories}
                onSparepartCreated={onSparepartCreated}
              />

              {splitError && (
                <div
                  role="alert"
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(224, 85, 85, 0.16)',
                    border: '1px solid var(--red-b)',
                    borderRadius: 8,
                    marginBottom: 14,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#fecaca',
                  }}
                >
                  {splitError}
                </div>
              )}

              <div className="receive-two-col">
                <div className="form-group">
                  <label
                    htmlFor={receiveDateId}
                    className="form-label"
                    style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                  >
                    Tanggal Penerimaan Fisik <span style={{ color: '#fca5a5' }}>*</span>
                  </label>
                  <input
                    id={receiveDateId}
                    type="date"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    required
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label
                    htmlFor={receiveVendorId}
                    className="form-label"
                    style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                  >
                    Vendor Pembuat PO
                  </label>
                  <input
                    id={receiveVendorId}
                    type="text"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    value={receiveVendor}
                    onChange={(e) => setReceiveVendor(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="receive-two-col">
                <div className="form-group">
                  <label
                    htmlFor={receiveDateId}
                    className="form-label"
                    style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                  >
                    Tanggal Penerimaan Fisik <span style={{ color: '#fca5a5' }}>*</span>
                  </label>
                  <input
                    id={receiveDateId}
                    type="date"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    required
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label
                      htmlFor={receiveQtyId}
                      className="form-label"
                      style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                    >
                      Qty Diterima ({packActive ? uomUnit : 'Pcs'}) <span style={{ color: '#fca5a5' }}>*</span>
                    </label>
                    {receiveQty < totalPhysicalUnits && (
                      <span style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 700 }}>
                        Parsial ({receiveQty}/{totalPhysicalUnits})
                      </span>
                    )}
                  </div>
                  <input
                    id={receiveQtyId}
                    type="number"
                    min="1"
                    max={totalPhysicalUnits}
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    required
                    value={receiveQty}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(totalPhysicalUnits, Number(e.target.value) || 1));
                      setReceiveQty(val);
                    }}
                  />
                  {totalPhysicalUnits > 1 && receiveQty < totalPhysicalUnits && (
                    <div style={{ marginTop: 4, textAlign: 'right' }}>
                      <button
                        type="button"
                        className="receive-focusable"
                        onClick={() => setReceiveQty(totalPhysicalUnits)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#93c5fd',
                          fontSize: 11,
                          cursor: 'pointer',
                          padding: 2,
                          textDecoration: 'underline',
                        }}
                      >
                        Terima Semua ({totalPhysicalUnits} {packActive ? uomUnit : 'Pcs'})
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {receiveQty < totalPhysicalUnits && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    border: '1px solid rgba(251, 191, 36, 0.4)',
                    borderRadius: 8,
                    marginTop: 12,
                    marginBottom: 14,
                    fontSize: 11.5,
                    color: '#fde68a',
                  }}
                >
                  <strong>Penerimaan Sebagian (Partial Receipt):</strong>
                  <div style={{ fontSize: 11, marginTop: 2, color: 'var(--tx)' }}>
                    Sebanyak <strong>{receiveQty} {packActive ? uomUnit : 'Pcs'}</strong> dicatat tiba hari ini. Sisa{' '}
                    <strong>{totalPhysicalUnits - receiveQty} {packActive ? uomUnit : 'Pcs'}</strong> otomatis tetap aktif di daftar PO.
                  </div>
                </div>
              )}

              <div className="receive-two-col" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label
                    htmlFor={receivePriceId}
                    className="form-label"
                    style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                  >
                    {packActive ? `Harga Dokumen PO (per ${uomPack})` : 'Harga Satuan Final (Rp)'}
                  </label>
                  <input
                    id={receivePriceId}
                    type="number"
                    min="0"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    value={receivePrice}
                    onChange={(e) => setReceivePrice(Number(e.target.value) || 0)}
                  />
                  {packActive && multiplier > 1 && (
                    <div style={{ fontSize: 11, color: '#4ade80', marginTop: 3 }}>
                      = Rp {unitPrice.toLocaleString('id-ID')} / {uomUnit} (masuk ke kartu stok)
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label
                    htmlFor={receiveVendorId}
                    className="form-label"
                    style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)' }}
                  >
                    Vendor Pembuat PO
                  </label>
                  <input
                    id={receiveVendorId}
                    type="text"
                    className="form-input receive-focusable"
                    style={{ minHeight: 44 }}
                    value={receiveVendor}
                    onChange={(e) => setReceiveVendor(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group" style={{ marginTop: 14 }}>
            <div
              className="form-label"
              style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)', marginBottom: 6, display: 'block' }}
            >
              Tujuan Akhir Penerimaan
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!canSelectStockDestination}
                aria-pressed={isStocked && canSelectStockDestination}
                className={`receive-tab-btn receive-focusable ${
                  isStocked && canSelectStockDestination ? 'receive-dest-btn--stock' : ''
                }`}
                onClick={() => {
                  if (canSelectStockDestination) setIsStocked(true);
                }}
                style={{ flex: '1 1 180px' }}
              >
                Masuk Stok Gudang
              </button>
              <button
                type="button"
                aria-pressed={!isStocked || !canSelectStockDestination}
                className={`receive-tab-btn receive-focusable ${
                  !isStocked || !canSelectStockDestination ? 'receive-dest-btn--direct' : ''
                }`}
                onClick={() => setIsStocked(false)}
                style={{ flex: '1 1 180px' }}
              >
                Langsung Pakai
              </button>
            </div>
            {!canSelectStockDestination && (
              <div style={{ fontSize: 11.5, color: '#fbbf24', marginTop: 6 }}>
                Item PO ini belum terhubung ke Master Sparepart. Gunakan mode Pecah Item (Multi-Item) di atas atau hubungkan ke Master Sparepart lebih dulu untuk memasukkan barang ke stok gudang.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="receive-btn-secondary receive-focusable"
              onClick={() => setShowReceiveModal(false)}
            >
              Batal
            </button>
            <button
              type="submit"
              className="receive-btn-confirm receive-focusable"
              disabled={actionLoading !== null}
            >
              {actionLoading !== null ? 'Menyimpan...' : 'Simpan Penerimaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
