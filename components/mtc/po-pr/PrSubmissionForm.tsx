import React from 'react';
import { Sparepart } from '@/types/mtc/procurement';
import { generateAutoAlias } from '@/lib/mtc/procurement-utils';

type PrSubmissionFormProps = {
  showRequestForm: boolean;
  setShowRequestForm: (val: boolean) => void;
  scriptUrl: string;
  spareparts: Sparepart[];
  isPengadaanBaru: boolean;
  setIsPengadaanBaru: (val: boolean) => void;
  catalogSearch: string;
  setCatalogSearch: (val: string) => void;
  showCatalogDropdown: boolean;
  setShowCatalogDropdown: (val: boolean) => void;
  reqOriginalName: string;
  setReqOriginalName: (val: string) => void;
  reqSparepartId: string;
  setReqSparepartId: (val: string) => void;
  reqKeterangan: string;
  setReqKeterangan: (val: string) => void;
  reqQty: number;
  setReqQty: (val: number) => void;
  reqProductCategory: string;
  setReqProductCategory: (val: string) => void;
  reqReason: string;
  setReqReason: (val: string) => void;
  reqUrgency: string;
  setReqUrgency: (val: string) => void;
  reqLinkReferences: string;
  setReqLinkReferences: (val: string) => void;
  reqIsStocked: boolean;
  setReqIsStocked: (val: boolean) => void;
  reqVendor: string;
  setReqVendor: (val: string) => void;
  reqNamaAlias: string;
  setReqNamaAlias: (val: string) => void;
  setReqAlasan: (val: string) => void;
  setReqLinkReference: (val: string) => void;
  requestStatus: { type: 'success' | 'error'; msg: string } | null;
  handleRequestSubmit: (e: React.FormEvent) => void;
  handleAddToCart: () => void;
  cartItems: any[];
  saveCartToLocalStorage: (cart: any[]) => void;
  handleRemoveFromCart: (id: number) => void;
  batchPrNo: string;
  setBatchPrNo: (val: string) => void;
  handleBatchSubmit: (e: React.FormEvent) => void;
  actionLoading: string | null;
};

export const PrSubmissionForm: React.FC<PrSubmissionFormProps> = ({
  showRequestForm,
  setShowRequestForm,
  scriptUrl,
  spareparts,
  isPengadaanBaru,
  setIsPengadaanBaru,
  catalogSearch,
  setCatalogSearch,
  showCatalogDropdown,
  setShowCatalogDropdown,
  reqOriginalName,
  setReqOriginalName,
  reqSparepartId,
  setReqSparepartId,
  reqKeterangan,
  setReqKeterangan,
  reqQty,
  setReqQty,
  reqProductCategory,
  setReqProductCategory,
  reqReason,
  setReqReason,
  reqUrgency,
  setReqUrgency,
  reqLinkReferences,
  setReqLinkReferences,
  reqIsStocked,
  setReqIsStocked,
  reqVendor,
  setReqVendor,
  reqNamaAlias,
  setReqNamaAlias,
  setReqAlasan,
  setReqLinkReference,
  requestStatus,
  handleRequestSubmit,
  handleAddToCart,
  cartItems,
  saveCartToLocalStorage,
  handleRemoveFromCart,
  batchPrNo,
  setBatchPrNo,
  handleBatchSubmit,
  actionLoading,
}) => {
  if (!showRequestForm) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 24,
        border: '1px solid var(--pur)',
        background: 'var(--sf3)',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--br)',
          padding: '16px 20px',
        }}
      >
        <div className="card-title" style={{ color: 'var(--pur)', margin: 0, fontSize: 14, fontWeight: 800 }}>
          📝 Form Pengajuan PR Baru (MTC Maintenance)
        </div>
        {scriptUrl ? (
          <span className="badge badge-grn" style={{ fontSize: 9, padding: '3px 8px' }}>
            ✓ Auto-Push ke Google Sheets Aktif
          </span>
        ) : (
          <span className="badge badge-ylw" style={{ fontSize: 9, padding: '3px 8px' }}>
            ⚠️ Simpan Lokal Saja (Belum ada Link Sheets)
          </span>
        )}
      </div>

      <form onSubmit={handleRequestSubmit} style={{ padding: 20 }}>
        {/* Mode Toggle Pill Selection */}
        <div
          style={{
            marginBottom: 16,
            background: 'var(--sf2)',
            padding: 4,
            borderRadius: 8,
            display: 'inline-flex',
            border: '1px solid var(--br)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsPengadaanBaru(false);
              setReqOriginalName('');
              setReqSparepartId('');
              setReqLinkReferences('');
              setReqReason('');
            }}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: !isPengadaanBaru ? 'var(--sf3)' : 'transparent',
              color: !isPengadaanBaru ? 'var(--pur)' : 'var(--tx3)',
              transition: 'all 0.15s',
            }}
          >
            🔄 Repeat Order (Pencarian Katalog)
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPengadaanBaru(true);
              setReqOriginalName('');
              setReqSparepartId('');
              setReqNamaAlias('');
              setReqLinkReferences('');
              setReqReason('');
              setReqVendor('');
            }}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: isPengadaanBaru ? 'var(--sf3)' : 'transparent',
              color: isPengadaanBaru ? 'var(--pur)' : 'var(--tx3)',
              transition: 'all 0.15s',
            }}
          >
            ➕ Pengadaan Baru (Entri Suku Cadang Baru)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 16 }}>
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!isPengadaanBaru ? (
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Cari Suku Cadang Resmi MTC (Autocomplete Riwayat)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ketik kata kunci untuk mencari di database riwayat..."
                  value={catalogSearch}
                  onChange={(e) => {
                    setCatalogSearch(e.target.value);
                    setShowCatalogDropdown(true);
                  }}
                  onFocus={() => setShowCatalogDropdown(true)}
                />

                {showCatalogDropdown && (() => {
                  const hasSearchText = catalogSearch.trim().length > 0;
                  const displayItems = hasSearchText
                    ? spareparts
                        .filter(
                          (sp) =>
                            sp.nama.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            (sp.namaAlias && sp.namaAlias.toLowerCase().includes(catalogSearch.toLowerCase()))
                        )
                        .slice(0, 8)
                    : spareparts.slice(0, 5);

                  if (displayItems.length === 0 && !hasSearchText) return null;

                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--sf2)',
                        border: '1px solid var(--br)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        zIndex: 99,
                        maxHeight: 220,
                        overflowY: 'auto',
                        marginTop: 6,
                      }}
                    >
                      <div
                        style={{
                          padding: '6px 10px',
                          fontSize: 9,
                          fontWeight: 800,
                          color: 'var(--tx3)',
                          borderBottom: '1px solid var(--br)',
                          textTransform: 'uppercase',
                          background: 'rgba(0,0,0,0.1)',
                        }}
                      >
                        {hasSearchText ? '🔍 Hasil Pencarian Suku Cadang' : '📋 5 Suku Cadang Riwayat Teratas'}
                      </div>

                      {displayItems.map((catItem, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setReqOriginalName(catItem.nama);
                            setReqSparepartId(catItem.id);
                            setReqKeterangan('repeat order');
                            setReqProductCategory('Sparepart');
                            setReqIsStocked(true);
                            setReqLinkReferences(catItem.linkReference || '');
                            setReqReason(catItem.alasan || 'Repeat Order');
                            setReqNamaAlias(catItem.namaAlias || '');
                            setReqVendor(catItem.vendor || '');
                            setReqAlasan(catItem.alasan || 'Repeat Order');
                            setReqLinkReference(catItem.linkReference || '');
                            setShowCatalogDropdown(false);
                            setCatalogSearch('');
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: 11,
                            borderBottom: '1px solid var(--br)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{catItem.nama}</div>
                            <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                              ID: {catItem.id} · Lokasi: {catItem.lokasi || '—'}
                            </div>
                          </div>
                          <span className="badge badge-grn" style={{ fontSize: 8 }}>
                            Pilih
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Nama Barang Asli (Original Material Name) <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ketik nama suku cadang panjang resmi..."
                  value={reqOriginalName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReqOriginalName(val);
                    setReqNamaAlias(generateAutoAlias(val));
                  }}
                />
              </div>
            )}

            {isPengadaanBaru && (
              <div className="form-group" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11, color: 'var(--pur)' }}>
                  Nama Alias Pendek (Title Case - Otomatis)
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Generate alias name..."
                  value={reqNamaAlias}
                  onChange={(e) => setReqNamaAlias(e.target.value)}
                  style={{ border: '1px solid var(--pur)', background: 'rgba(168, 85, 247, 0.02)' }}
                />
              </div>
            )}

            {isPengadaanBaru && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Rekomendasi Vendor / Toko
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Tokopedia PT ABC..."
                  value={reqVendor}
                  onChange={(e) => setReqVendor(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Suku Cadang Resmi Terhubung
              </label>
              <input
                type="text"
                className="form-input"
                disabled
                placeholder="Terisi otomatis saat memilih suku cadang..."
                value={
                  reqSparepartId
                    ? `${reqOriginalName} (${reqSparepartId})`
                    : '— Tanpa Koneksi (General/Suku Cadang Baru) —'
                }
                style={{ opacity: 0.7, background: 'var(--sf2)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Keterangan / Tipe Pengadaan
                </label>
                <select
                  className="form-input form-select"
                  value={reqKeterangan}
                  onChange={(e) => setReqKeterangan(e.target.value)}
                  style={{ height: '38px' }}
                >
                  <option value="consumable">consumable (Langsung habis)</option>
                  <option value="one time purchase">one time purchase (Sekali beli)</option>
                  <option value="repeat order">repeat order (Beli berkala)</option>
                  <option value="project">project (Kebutuhan project)</option>
                  <option value="tools">tools (Perkakas kerja)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Tingkat Urgensi
                </label>
                <select
                  className="form-input form-select"
                  value={reqUrgency}
                  onChange={(e) => setReqUrgency(e.target.value)}
                  style={{ height: '38px' }}
                >
                  <option value="Normal">🟢 Normal</option>
                  <option value="Urgent">🚨 Urgent / Mendesak</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Jumlah / Qty <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  className="form-input"
                  value={reqQty}
                  onChange={(e) => setReqQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Kategori Produk
                </label>
                <select
                  className="form-input form-select"
                  value={reqProductCategory}
                  onChange={(e) => setReqProductCategory(e.target.value)}
                  style={{ height: '38px' }}
                >
                  <option value="Sparepart">Sparepart</option>
                  <option value="Tools">Tools (Alat Kerja)</option>
                  <option value="Special Tools">Special Tools</option>
                  <option value="Consumable">Consumable</option>
                  <option value="Lain-lain">Lain-lain</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label
                className="form-label"
                style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, display: 'block' }}
              >
                Rencana Penyimpanan Barang (Tujuan Akhir)
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className={`btn ${reqIsStocked ? 'btn-grn' : 'btn-ghost'}`}
                  onClick={() => setReqIsStocked(true)}
                  style={{
                    flex: 1,
                    height: 36,
                    fontSize: 11,
                    fontWeight: 700,
                    border: reqIsStocked ? 'none' : '1px solid var(--br)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  📦 Masuk Stok Gudang
                </button>
                <button
                  type="button"
                  className={`btn ${!reqIsStocked ? 'btn-pur' : 'btn-ghost'}`}
                  onClick={() => setReqIsStocked(false)}
                  style={{
                    flex: 1,
                    height: 36,
                    fontSize: 11,
                    fontWeight: 700,
                    border: !reqIsStocked ? 'none' : '1px solid var(--br)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Konsumsi / Langsung Habis
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Link Referensi Toko / Penawaran Vendor
              </label>
              <input
                type="url"
                className="form-input"
                placeholder={
                  !isPengadaanBaru ? 'Terkunci untuk repeat order' : 'Tempel link Tokopedia, Shopee...'
                }
                value={reqLinkReferences}
                onChange={(e) => setReqLinkReferences(e.target.value)}
                readOnly={!isPengadaanBaru}
                style={{
                  background: !isPengadaanBaru ? 'var(--sf2)' : 'var(--sf3)',
                  opacity: !isPengadaanBaru ? 0.7 : 1,
                  cursor: !isPengadaanBaru ? 'not-allowed' : 'text',
                }}
              />
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
            Alasan Pembelian (Reason / Deskripsi Kebutuhan Mesin)
          </label>
          <textarea
            className="form-input"
            placeholder={
              !isPengadaanBaru
                ? 'Terkunci untuk repeat order'
                : 'Jelaskan detail untuk mesin apa, kerusakan apa...'
            }
            rows={2}
            value={reqReason}
            onChange={(e) => setReqReason(e.target.value)}
            readOnly={!isPengadaanBaru}
            style={{
              height: '54px',
              padding: '8px 12px',
              resize: 'none',
              background: !isPengadaanBaru ? 'var(--sf2)' : 'var(--sf3)',
              opacity: !isPengadaanBaru ? 0.7 : 1,
              cursor: !isPengadaanBaru ? 'not-allowed' : 'text',
            }}
          />
        </div>

        {requestStatus && (
          <div
            className={`alert ${requestStatus.type === 'success' ? 'alert-grn' : 'alert-red'}`}
            style={{ marginBottom: 16 }}
          >
            {requestStatus.msg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowRequestForm(false)}
            style={{ cursor: 'pointer' }}
          >
            Batal
          </button>

          <button
            type="button"
            className="btn btn-grn"
            onClick={handleAddToCart}
            style={{
              fontWeight: 800,
              padding: '0 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🛒 Tambahkan ke Keranjang
          </button>

          <button
            type="submit"
            className="btn btn-pur"
            disabled={actionLoading === 'request'}
            style={{ fontWeight: 800, padding: '0 24px', cursor: 'pointer' }}
          >
            {actionLoading === 'request' ? 'Menyimpan...' : '💾 Kirim Langsung'}
          </button>
        </div>
      </form>

      {/* Cart Section */}
      {cartItems.length > 0 && (
        <>
          <div style={{ borderTop: '1px dashed var(--br)', margin: '0 20px 20px 20px' }}></div>

          <div
            style={{
              padding: '0 20px 12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🛒</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--pur)' }}>
                Keranjang Rencana PR Sementara ({cartItems.length} Item)
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (confirm('Apakah Anda yakin ingin mengosongkan keranjang?')) {
                  saveCartToLocalStorage([]);
                }
              }}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                color: 'var(--red)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                height: 'auto',
                background: 'transparent',
              }}
            >
              🗑️ Kosongkan
            </button>
          </div>

          <div style={{ padding: '0 20px 20px 20px' }}>
            <div
              style={{
                border: '1px solid var(--br)',
                borderRadius: 8,
                background: 'var(--sf2)',
                overflowX: 'auto',
                marginBottom: 16,
              }}
            >
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--br)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: 40 }}>
                      No
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>
                      Nama Suku Cadang / Barang
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: 60 }}>
                      Qty
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, width: 100 }}>
                      Kategori
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, width: 100 }}>
                      Urgensi
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, width: 120 }}>
                      Rencana Simpan
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: 60 }}>
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx < cartItems.length - 1 ? '1px solid var(--br)' : 'none',
                      }}
                    >
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--tx3)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700 }}>{item.originalName}</div>
                        {item.sparepartId && (
                          <div style={{ fontSize: 9, color: 'var(--pur)', marginTop: 2 }}>
                            ID Master: {item.sparepartId}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                        {item.qty} Pcs
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className="badge"
                          style={{ background: 'var(--sf3)', border: '1px solid var(--br)', fontSize: 9 }}
                        >
                          {item.productCategory}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className={`badge ${item.urgency === 'Urgent' ? 'badge-red' : 'badge-grn'}`}
                          style={{ fontSize: 9 }}
                        >
                          {item.urgency === 'Urgent' ? '🚨 Urgent' : '🟢 Normal'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className={`badge ${item.isStocked ? 'badge-grn' : 'badge-pur'}`}
                          style={{ fontSize: 9 }}
                        >
                          {item.isStocked ? '📦 Masuk Stok' : '⚡ Konsumsi'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--red)',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: 12,
                          }}
                          title="Hapus dari keranjang"
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleBatchSubmit}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                padding: 16,
                background: 'rgba(124, 58, 237, 0.05)',
                border: '1px dashed var(--pur)',
                borderRadius: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label
                  className="form-label"
                  style={{ fontWeight: 800, fontSize: 11, color: 'var(--pur)', display: 'block', marginBottom: 6 }}
                >
                  Nomor PR Bersama (Cap PR Group) <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Contoh: PR/2026/06/001"
                  value={batchPrNo}
                  onChange={(e) => setBatchPrNo(e.target.value)}
                  style={{ width: '100%', maxWidth: 280, border: '1px solid var(--pur)' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-pur"
                disabled={actionLoading === 'batch-request'}
                style={{
                  fontWeight: 800,
                  padding: '0 24px',
                  height: '38px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, var(--pur) 100%)',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                {actionLoading === 'batch-request' ? (
                  <>
                    <span
                      className="spinner"
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    Mengirim Masal...
                  </>
                ) : (
                  '🚢 Kirim Pengajuan PR Masal'
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
