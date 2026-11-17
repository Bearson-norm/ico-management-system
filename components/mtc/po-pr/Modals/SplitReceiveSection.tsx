import React, { useEffect, useId, useState } from 'react';
import {
  BundlePartInput,
  allocateEvenlyByQty,
  allocateRemainingToLast,
  calculateBundleAllocation,
} from '@/lib/mtc/bundle-receive';

type SparepartSearchOption = {
  id: string;
  nama: string;
  uom: string;
  lokasi: string | null;
  harga: number;
};

type SplitReceiveSectionProps = {
  poQty: number;
  poUnitPrice: number;
  parts: BundlePartInput[];
  setParts: React.Dispatch<React.SetStateAction<BundlePartInput[]>>;
  dbCategories: { id: number; nama: string; tipe: string }[];
  onSparepartCreated?: () => void;
};

type SplitPartRowProps = {
  index: number;
  part: BundlePartInput;
  canRemove: boolean;
  selectedOtherIds: Set<string>;
  dbCategories: { id: number; nama: string; tipe: string }[];
  onChangePart: (index: number, patch: Partial<BundlePartInput>) => void;
  onRemove: (index: number) => void;
  onSparepartCreated?: () => void;
};

const SplitPartRow: React.FC<SplitPartRowProps> = ({
  index,
  part,
  canRemove,
  selectedOtherIds,
  dbCategories,
  onChangePart,
  onRemove,
  onSparepartCreated,
}) => {
  const baseId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(!part.sparepartId);
  const [results, setResults] = useState<SparepartSearchOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNama, setNewNama] = useState('');
  const [newKategoriId, setNewKategoriId] = useState('');
  const [newLokasi, setNewLokasi] = useState('');
  const [newUom, setNewUom] = useState('Pcs');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setPickerOpen(!part.sparepartId);
  }, [part.sparepartId]);

  useEffect(() => {
    if (!pickerOpen) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(
          `/api/mtc/master/sparepart?simple=true&search=${encodeURIComponent(searchQuery.trim())}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setResults(json.data);
        } else {
          setSearchError(json.error || 'Gagal memuat master sparepart.');
        }
      } catch {
        if (!cancelled) {
          setSearchError('Gagal memuat master sparepart. Periksa koneksi lalu coba lagi.');
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerOpen, searchQuery, retryCounter]);

  async function handleCreateMaster() {
    if (!newNama.trim()) {
      setCreateError('Nama sparepart resmi wajib diisi.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/mtc/master/sparepart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: newNama.trim(),
          kategoriId: newKategoriId ? Number(newKategoriId) : null,
          lokasi: newLokasi.trim() || null,
          uom: newUom.trim() || 'Pcs',
          harga: Number(part.harga) || 0,
        }),
      });
      const json = await res.json();
      if (!json.success || !json.data) {
        setCreateError(json.error || 'Gagal membuat master sparepart baru.');
        return;
      }

      const created = json.data;
      onChangePart(index, {
        sparepartId: created.id,
        nama: created.nama,
        uom: created.uom || 'Pcs',
        lokasi: created.lokasi || null,
      });
      setShowCreateForm(false);
      setPickerOpen(false);
      setNewNama('');
      setNewKategoriId('');
      setNewLokasi('');
      setNewUom('Pcs');
      onSparepartCreated?.();
    } catch {
      setCreateError('Koneksi bermasalah saat menyimpan master sparepart.');
    } finally {
      setCreating(false);
    }
  }

  const subtotal = Math.round((Number(part.qty) || 0) * (Number(part.harga) || 0));
  const searchInputId = `${baseId}-search`;
  const qtyInputId = `${baseId}-qty`;
  const priceInputId = `${baseId}-price`;

  return (
    <div
      style={{
        padding: 12,
        background: 'var(--sf)',
        border: '1px solid var(--brh)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="split-part-grid">
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
              gap: 8,
            }}
          >
            {pickerOpen || !part.sparepartId ? (
              <label
                htmlFor={searchInputId}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}
              >
                Komponen {index + 1} (Master Sparepart)
              </label>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
                Komponen {index + 1} (Master Sparepart)
              </span>
            )}
            {part.sparepartId && (
              <button
                type="button"
                className="receive-focusable"
                onClick={() => {
                  setPickerOpen((prev) => !prev);
                  setShowCreateForm(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#93c5fd',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: 44,
                  padding: '0 6px',
                  textDecoration: 'underline',
                }}
              >
                {pickerOpen ? 'Tutup pilihan' : 'Ganti'}
              </button>
            )}
          </div>

          {part.sparepartId && !pickerOpen ? (
            <div
              style={{
                padding: '8px 10px',
                background: 'var(--sf3)',
                border: '1px solid var(--brh)',
                borderRadius: 8,
                minHeight: 44,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>
                {part.nama}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>
                ID: {part.sparepartId} | Rak: {part.lokasi || '-'} | UOM: {part.uom || 'Pcs'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                id={searchInputId}
                type="text"
                className="form-input receive-focusable"
                placeholder="Cari nama atau ID sparepart..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minHeight: 44, fontSize: 13 }}
              />

              <div
                style={{
                  background: 'var(--sf3)',
                  border: '1px solid var(--brh)',
                  borderRadius: 8,
                  maxHeight: 170,
                  overflowY: 'auto',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {searchLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--tx2)', padding: '10px 8px' }}>
                    Mencari suku cadang...
                  </div>
                ) : searchError ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#fca5a5',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>{searchError}</span>
                    <button
                      type="button"
                      className="receive-btn-secondary receive-focusable"
                      style={{ minHeight: 44, padding: '0 12px', fontSize: 11.5 }}
                      onClick={() => setRetryCounter((c) => c + 1)}
                    >
                      Coba Lagi
                    </button>
                  </div>
                ) : results.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--tx2)', padding: '10px 8px' }}>
                    Tidak ditemukan di Master. Buat master baru di bawah jika item belum terdaftar.
                  </div>
                ) : (
                  results.slice(0, 25).map((sp) => {
                    const isUsedElsewhere = selectedOtherIds.has(sp.id);
                    const isCurrent = part.sparepartId === sp.id;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        disabled={isUsedElsewhere}
                        className="receive-focusable"
                        onClick={() => {
                          onChangePart(index, {
                            sparepartId: sp.id,
                            nama: sp.nama,
                            uom: sp.uom || 'Pcs',
                            lokasi: sp.lokasi || null,
                          });
                          setPickerOpen(false);
                          setShowCreateForm(false);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: isCurrent
                            ? '1px solid #60a5fa'
                            : '1px solid transparent',
                          background: isCurrent ? 'rgba(59, 130, 246, 0.16)' : 'var(--sf2)',
                          color: 'var(--tx)',
                          cursor: isUsedElsewhere ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>
                            {sp.nama}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                            {sp.id} | Rak: {sp.lokasi || '-'} | {sp.uom || 'Pcs'}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: isUsedElsewhere ? '#fbbf24' : '#93c5fd',
                            flexShrink: 0,
                          }}
                        >
                          {isUsedElsewhere ? 'Sudah dipilih' : 'Pilih'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div>
                <button
                  type="button"
                  className="receive-focusable"
                  onClick={() => {
                    setShowCreateForm((prev) => !prev);
                    setCreateError(null);
                    if (!newNama && searchQuery.trim()) {
                      setNewNama(searchQuery.trim());
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#c4b5fd',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: 44,
                    padding: '0 4px',
                    textDecoration: 'underline',
                  }}
                >
                  {showCreateForm ? 'Tutup form master baru' : '+ Buat Master Sparepart Baru'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor={qtyInputId}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
          >
            Qty ({part.uom || 'Pcs'})
          </label>
          <input
            id={qtyInputId}
            type="number"
            min={1}
            step={1}
            required
            className="form-input receive-focusable"
            style={{ minHeight: 44, fontSize: 13 }}
            value={part.qty === 0 ? '' : part.qty}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChangePart(index, { qty: 0 });
                return;
              }
              const parsed = parseInt(raw, 10);
              onChangePart(index, { qty: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
            }}
            onBlur={() => {
              if (!part.qty || part.qty < 1) {
                onChangePart(index, { qty: 1 });
              }
            }}
          />
        </div>

        <div>
          <label
            htmlFor={priceInputId}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
          >
            Harga Satuan (Rp)
          </label>
          <input
            id={priceInputId}
            type="number"
            min={0}
            step="any"
            placeholder="0"
            required
            className="form-input receive-focusable"
            style={{ minHeight: 44, fontSize: 13 }}
            value={part.harga === 0 ? '' : part.harga}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChangePart(index, { harga: 0 });
                return;
              }
              const num = Number(raw);
              const val = Number.isFinite(num) && num >= 0 ? num : 0;
              onChangePart(index, { harga: val });
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 4 }}>
            Subtotal
          </div>
          <div
            style={{
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--tx)',
              padding: '0 4px',
            }}
          >
            Rp {subtotal.toLocaleString('id-ID')}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={!canRemove}
            aria-label={`Hapus komponen ${index + 1}`}
            title={canRemove ? `Hapus komponen ${index + 1}` : 'Minimal 2 komponen'}
            className="receive-btn-secondary receive-focusable"
            onClick={() => onRemove(index)}
            style={{
              minWidth: 44,
              minHeight: 44,
              padding: 0,
              color: canRemove ? '#fca5a5' : 'var(--tx2)',
              borderColor: canRemove ? 'var(--red-b)' : 'var(--brh)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" />
            </svg>
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div
          style={{
            padding: 12,
            background: 'var(--sf3)',
            border: '1px solid var(--pur-b)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
            Buat Master Sparepart Baru (Komponen {index + 1})
          </div>

          <div className="receive-two-col">
            <div>
              <label
                htmlFor={`${baseId}-new-nama`}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
              >
                Nama Sparepart Resmi *
              </label>
              <input
                id={`${baseId}-new-nama`}
                type="text"
                className="form-input receive-focusable"
                placeholder="Contoh: Base Relay MY4N (PYF14A)"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
                style={{ minHeight: 44, fontSize: 13 }}
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-new-kat`}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
              >
                Kategori
              </label>
              <select
                id={`${baseId}-new-kat`}
                className="form-input form-select receive-focusable"
                value={newKategoriId}
                onChange={(e) => setNewKategoriId(e.target.value)}
                style={{ minHeight: 44, fontSize: 13 }}
              >
                <option value="">Tanpa Kategori</option>
                {dbCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-new-sloc`}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
              >
                Lokasi Rak (SLOC)
              </label>
              <input
                id={`${baseId}-new-sloc`}
                type="text"
                className="form-input receive-focusable"
                placeholder="Contoh: Rak A-02"
                value={newLokasi}
                onChange={(e) => setNewLokasi(e.target.value)}
                style={{ minHeight: 44, fontSize: 13 }}
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-new-uom`}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}
              >
                Satuan (UOM)
              </label>
              <input
                id={`${baseId}-new-uom`}
                type="text"
                className="form-input receive-focusable"
                value={newUom}
                onChange={(e) => setNewUom(e.target.value)}
                style={{ minHeight: 44, fontSize: 13 }}
              />
            </div>
          </div>

          {createError && (
            <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>
              {createError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="receive-btn-secondary receive-focusable"
              onClick={() => {
                setShowCreateForm(false);
                setCreateError(null);
              }}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={creating}
              className="receive-btn-confirm receive-focusable"
              onClick={handleCreateMaster}
            >
              {creating ? 'Menyimpan...' : 'Simpan & Pilih'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SplitReceiveSection: React.FC<SplitReceiveSectionProps> = ({
  poQty,
  poUnitPrice,
  parts,
  setParts,
  dbCategories,
  onSparepartCreated,
}) => {
  const { poTotal, allocatedTotal, difference } = calculateBundleAllocation(
    poQty,
    poUnitPrice,
    parts
  );

  function handleChangePart(index: number, patch: Partial<BundlePartInput>) {
    setParts((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  function handleRemovePart(index: number) {
    setParts((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== index)));
  }

  function handleAddPart() {
    setParts((prev) => [
      ...prev,
      {
        sparepartId: '',
        nama: '',
        qty: Math.max(1, Math.round(poQty) || 1),
        harga: 0,
        uom: 'Pcs',
        lokasi: null,
      },
    ]);
  }

  function handleAllocateEvenly() {
    const unitPrices = allocateEvenlyByQty(poTotal, parts);
    setParts((prev) =>
      prev.map((item, idx) => ({
        ...item,
        harga: unitPrices[idx] ?? 0,
      }))
    );
  }

  function handleFillRemaining() {
    if (parts.length === 0) return;
    const lastPrice = allocateRemainingToLast(poTotal, parts);
    const lastIdx = parts.length - 1;
    setParts((prev) =>
      prev.map((item, idx) => (idx === lastIdx ? { ...item, harga: lastPrice } : item))
    );
  }

  let diffText = 'Pas (Rp 0)';
  let diffColor = '#4ade80';
  if (difference < 0) {
    diffText = `Kurang Rp ${Math.abs(difference).toLocaleString('id-ID')}`;
    diffColor = '#fbbf24';
  } else if (difference > 0) {
    diffText = `Lebih Rp ${difference.toLocaleString('id-ID')}`;
    diffColor = '#fbbf24';
  }

  return (
    <div
      style={{
        padding: 14,
        background: 'var(--sf3)',
        border: '1px solid var(--brh)',
        borderRadius: 10,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>
            Rincian Komponen Pecahan (1 Transaksi)
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 2 }}>
            Pilih minimal 2 Master Sparepart berbeda dan tentukan pembagian qty serta harga per komponen.
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
          Total PO: Rp {poTotal.toLocaleString('id-ID')} ({poQty} x Rp{' '}
          {Math.round(poUnitPrice || 0).toLocaleString('id-ID')})
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {parts.map((part, idx) => {
          const otherIds = new Set(
            parts
              .filter((_, i) => i !== idx)
              .map((p) => p.sparepartId)
              .filter(Boolean)
          );
          return (
            <SplitPartRow
              key={`split-row-${idx}`}
              index={idx}
              part={part}
              canRemove={parts.length > 2}
              selectedOtherIds={otherIds}
              dbCategories={dbCategories}
              onChangePart={handleChangePart}
              onRemove={handleRemovePart}
              onSparepartCreated={onSparepartCreated}
            />
          );
        })}
      </div>

      <div>
        <button
          type="button"
          className="receive-btn-secondary receive-focusable"
          onClick={handleAddPart}
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
            <path d="M8 3v10M3 8h10" />
          </svg>
          Tambah Komponen
        </button>
      </div>

      <div
        style={{
          padding: 12,
          background: 'var(--sf)',
          border: '1px solid var(--brh)',
          borderRadius: 8,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)' }}>Total Nilai PO</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>
              Rp {poTotal.toLocaleString('id-ID')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)' }}>Total Alokasi</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>
              Rp {allocatedTotal.toLocaleString('id-ID')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)' }}>Selisih dari PO</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: diffColor }}>
              {diffText}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="receive-btn-secondary receive-focusable"
            onClick={handleAllocateEvenly}
          >
            Bagi Rata
          </button>
          <button
            type="button"
            className="receive-btn-secondary receive-focusable"
            onClick={handleFillRemaining}
          >
            Isi Sisa ke Baris Terakhir
          </button>
        </div>
      </div>
    </div>
  );
};
