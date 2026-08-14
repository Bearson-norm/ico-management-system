import React from 'react';
import { TrackingItem } from '@/types/mtc/procurement';

type LinkSparepartModalProps = {
  showLinkModal: boolean;
  setShowLinkModal: (val: boolean) => void;
  linkingItem: TrackingItem | null;
  linkSearch: string;
  setLinkSearch: (val: string) => void;
  linkSuggestions: any[];
  loadingSuggestions: boolean;
  handleLinkSparepart: (sparepartId: string) => void;
  isCreatingNewSp: boolean;
  setIsCreatingNewSp: (val: boolean) => void;
  newSpNama: string;
  setNewSpNama: (val: string) => void;
  newSpAlias: string;
  setNewSpAlias: (val: string) => void;
  newSpKategoriId: string;
  setNewSpKategoriId: (val: string) => void;
  newSpLokasi: string;
  setNewSpLokasi: (val: string) => void;
  newSpUom: string;
  setNewSpUom: (val: string) => void;
  newSpIsStocked: boolean;
  setNewSpIsStocked: (val: boolean) => void;
  dbCategories: { id: number; nama: string; tipe: string }[];
  handleCreateAndLinkSparepart: (e: React.FormEvent) => void;
  actionLoading: string | null;
};

export const LinkSparepartModal: React.FC<LinkSparepartModalProps> = ({
  showLinkModal,
  setShowLinkModal,
  linkingItem,
  linkSearch,
  setLinkSearch,
  linkSuggestions,
  loadingSuggestions,
  handleLinkSparepart,
  isCreatingNewSp,
  setIsCreatingNewSp,
  newSpNama,
  setNewSpNama,
  newSpAlias,
  setNewSpAlias,
  newSpKategoriId,
  setNewSpKategoriId,
  newSpLokasi,
  setNewSpLokasi,
  newSpUom,
  setNewSpUom,
  newSpIsStocked,
  setNewSpIsStocked,
  dbCategories,
  handleCreateAndLinkSparepart,
  actionLoading,
}) => {
  if (!showLinkModal || !linkingItem) return null;

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
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--sf2)',
          border: '1px solid var(--pur)',
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
          <div className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--pur)', margin: 0 }}>
            🔗 Hubungkan Barang ke Database Master Suku Cadang
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowLinkModal(false)}
            style={{ fontSize: 16, cursor: 'pointer' }}
          >
            ✖
          </button>
        </div>

        <div style={{ padding: 20 }}>
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
            <div style={{ color: 'var(--tx3)' }}>Item Pengadaan Saat Ini:</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--tx)', marginTop: 2 }}>
              {linkingItem.originalName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
              Qty: {linkingItem.qty} Pcs · Kategori: {linkingItem.productCategory || 'Sparepart'}
            </div>
          </div>

          <div
            style={{
              marginBottom: 16,
              background: 'var(--sf2)',
              padding: 3,
              borderRadius: 8,
              display: 'flex',
              border: '1px solid var(--br)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsCreatingNewSp(false)}
              style={{
                flex: 1,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: !isCreatingNewSp ? 'var(--sf3)' : 'transparent',
                color: !isCreatingNewSp ? 'var(--pur)' : 'var(--tx3)',
              }}
            >
              🔍 Cari di Master Database
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingNewSp(true)}
              style={{
                flex: 1,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: isCreatingNewSp ? 'var(--sf3)' : 'transparent',
                color: isCreatingNewSp ? 'var(--pur)' : 'var(--tx3)',
              }}
            >
              ➕ Buat Master Suku Cadang Baru
            </button>
          </div>

          {!isCreatingNewSp ? (
            <div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Cari Nama atau ID Suku Cadang Master
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ketik kata kunci pencarian..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                />
              </div>

              {loadingSuggestions && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: 12 }}>
                  Mencari suku cadang...
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {linkSuggestions.map((sp) => (
                  <div
                    key={sp.id}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--sf3)',
                      border: '1px solid var(--br)',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{sp.nama}</div>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                        ID: {sp.id} · Lokasi: {sp.lokasi || '—'} · UOM: {sp.uom}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-pur btn-sm"
                      disabled={actionLoading !== null}
                      onClick={() => handleLinkSparepart(sp.id)}
                      style={{ fontWeight: 800, padding: '4px 12px', fontSize: 10, cursor: 'pointer' }}
                    >
                      Hubungkan
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateAndLinkSparepart} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Nama Suku Cadang Resmi Master <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={newSpNama}
                  onChange={(e) => setNewSpNama(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Nama Alias Suku Cadang
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={newSpAlias}
                  onChange={(e) => setNewSpAlias(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                    Kategori Master
                  </label>
                  <select
                    className="form-input form-select"
                    value={newSpKategoriId}
                    onChange={(e) => setNewSpKategoriId(e.target.value)}
                  >
                    <option value="">— Tanpa Kategori —</option>
                    {dbCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                    Lokasi Rak Gudang (SLOC)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Rak A-02"
                    value={newSpLokasi}
                    onChange={(e) => setNewSpLokasi(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Rencana Stok
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className={`btn ${newSpIsStocked ? 'btn-grn' : 'btn-ghost'}`}
                    onClick={() => setNewSpIsStocked(true)}
                    style={{ flex: 1, height: 34, fontSize: 10, fontWeight: 700 }}
                  >
                    📦 Masuk Stok
                  </button>
                  <button
                    type="button"
                    className={`btn ${!newSpIsStocked ? 'btn-pur' : 'btn-ghost'}`}
                    onClick={() => setNewSpIsStocked(false)}
                    style={{ flex: 1, height: 34, fontSize: 10, fontWeight: 700 }}
                  >
                    ⚡ Langsung Pakai
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowLinkModal(false)}>
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={actionLoading !== null}
                  style={{ fontWeight: 800, padding: '0 20px' }}
                >
                  💾 Buat & Hubungkan
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
