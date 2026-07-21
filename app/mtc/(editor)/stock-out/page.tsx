'use client';
import { useState, useEffect, FormEvent } from 'react';

type StockOutItem = {
  sparepartId: string;
  qty: number;
  nama: string;
  stok: number;
  uom: string;
  mesins: { id: number; nama: string }[];
  mesinNama: string;
  isCustomMesin: boolean;
  keterangan: string;
};

export default function StockOutPage() {
  const [teknisis, setTeknisis] = useState<any[]>([]);
  const [spareparts, setSpareparts] = useState<any[]>([]);
  const [allMesins, setAllMesins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spSearch, setSpSearch] = useState('');

  const [form, setForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    picId: '',
    noReport: '',
    keterangan: '',
    items: [] as StockOutItem[],
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [resT, resS, resM] = await Promise.all([
          fetch('/api/mtc/master/teknisi').then((r) => r.json()),
          fetch('/api/mtc/stock').then((r) => r.json()),
          fetch('/api/mtc/master/mesin').then((r) => r.json()),
        ]);
        if (resT.success) setTeknisis(resT.data);
        if (resS.success) setSpareparts(resS.data);
        if (resM.success) setAllMesins(resM.data);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredSP = spareparts.filter((sp) => {
    if (!spSearch) return true;
    const q = spSearch.toLowerCase();
    return (
      sp.nama.toLowerCase().includes(q) ||
      sp.id.toLowerCase().includes(q) ||
      (sp.lokasi || '').toLowerCase().includes(q)
    );
  });

  const addItem = (sp: any) => {
    if (form.items.find((s) => s.sparepartId === sp.id)) return alert('Sudah ada di daftar');
    if (sp.currentStock <= 0) return alert('Stok kosong (0).');

    // Auto-select mesin dari BOM jika ada
    const defaultMesin = sp.mesins && sp.mesins.length > 0 ? sp.mesins[0].nama : '';

    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          sparepartId: sp.id,
          qty: 1,
          nama: sp.nama,
          stok: sp.currentStock,
          uom: sp.uom,
          mesins: sp.mesins || [],
          mesinNama: defaultMesin,
          isCustomMesin: false,
          keterangan: '',
        },
      ],
    }));
    setSpModalOpen(false);
    setSpSearch('');
  };

  const removeItem = (id: string) =>
    setForm((p) => ({ ...p, items: p.items.filter((s) => s.sparepartId !== id) }));

  const updateQty = (id: string, delta: number) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((s) => {
        if (s.sparepartId === id) {
          const newQty = s.qty + delta;
          if (newQty < 1) return s;
          if (newQty > s.stok) {
            alert(`Maksimal ${s.stok}`);
            return s;
          }
          return { ...s, qty: newQty };
        }
        return s;
      }),
    }));
  };

  const updateItemMesin = (id: string, value: string) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((item) => {
        if (item.sparepartId !== id) return item;
        if (value === '__OTHER__') {
          return { ...item, isCustomMesin: true, mesinNama: '' };
        }
        return { ...item, isCustomMesin: false, mesinNama: value };
      }),
    }));
  };

  const updateItemKeterangan = (id: string, text: string) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((item) =>
        item.sparepartId === id ? { ...item, keterangan: text } : item
      ),
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.items.length === 0) return alert('Pilih minimal 1 barang');

    setSubmitting(true);
    setMessage(null);

    const payload = {
      tanggal: form.tanggal,
      picId: parseInt(form.picId),
      noReport: form.noReport,
      keterangan: form.keterangan,
      items: form.items.map((i) => ({
        sparepartId: i.sparepartId,
        qty: i.qty,
        mesinNama: i.mesinNama,
        keterangan: i.keterangan,
      })),
    };

    try {
      const res = await fetch('/api/mtc/stock/out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: 'success',
          text: `✅ Berhasil mengeluarkan ${json.data.count} jenis barang`,
        });
        setForm({
          tanggal: new Date().toISOString().split('T')[0],
          picId: '',
          noReport: '',
          keterangan: '',
          items: [],
        });
        // Refresh stock
        fetch('/api/mtc/stock')
          .then((r) => r.json())
          .then((rs) => {
            if (rs.success) setSpareparts(rs.data);
          });
        window.scrollTo(0, 0);
      } else {
        setMessage({ type: 'error', text: `❌ ${json.error}` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Memuat data...</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-title">📤 Stock Out</div>
        <div className="page-sub">Pengeluaran barang dengan spesifikasi Mesin & BOM otomatis</div>
      </div>

      <div className="page-body">
        {message && (
          <div
            className={`alert ${message.type === 'success' ? 'alert-grn' : 'alert-red'}`}
            style={{ marginBottom: 20 }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 850, margin: '0 auto' }}>
          <div className="card-header">
            <div className="card-title">Informasi Pengeluaran</div>
          </div>
          <div className="card-body form-grid">
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  Tanggal <span className="req">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  PIC (Penerima/Teknisi) <span className="req">*</span>
                </label>
                <select
                  className="form-input form-select"
                  required
                  value={form.picId}
                  onChange={(e) => setForm({ ...form, picId: e.target.value })}
                >
                  <option value="">Pilih...</option>
                  {teknisis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">No Report (Opsional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: MTC-CM-001"
                  value={form.noReport}
                  onChange={(e) => setForm({ ...form, noReport: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan Umum / Catatan (Opsional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Keterangan tambahan transaksi..."
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                />
              </div>
            </div>

            <div className="divider" />
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ margin: 0 }}>
                Daftar Barang & Tujuan Mesin <span className="req">*</span>
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSpModalOpen(true)}
              >
                + Tambah Barang
              </button>
            </div>

            {form.items.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  background: 'var(--sf2)',
                  borderRadius: 8,
                  border: '1px dashed var(--brh)',
                  color: 'var(--tx3)',
                }}
              >
                Belum ada barang dipilih. Klik <strong>+ Tambah Barang</strong> di atas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {form.items.map((sp) => {
                  const isBomMatch = sp.mesins.some((m) => m.nama === sp.mesinNama);
                  return (
                    <div
                      key={sp.sparepartId}
                      className="sp-item"
                      style={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 10,
                        padding: 14,
                        background: 'var(--sf2)',
                        borderRadius: 8,
                        border: '1px solid var(--br)',
                      }}
                    >
                      {/* Baris Atas: Informasi Barang + Tombol Hapus */}
                      <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                        <div className="sp-info">
                          <div className="sp-name" style={{ fontSize: 15, fontWeight: 700 }}>
                            {sp.nama}
                            {isBomMatch && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  background: 'var(--grn-d)',
                                  color: 'var(--grn)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                🤖 Otomatis BOM
                              </span>
                            )}
                          </div>
                          <div className="sp-sub" style={{ fontSize: 12, marginTop: 2 }}>
                            ID: {sp.sparepartId} · Stok Tersedia:{' '}
                            <strong style={{ color: 'var(--grn)' }}>{sp.stok}</strong> {sp.uom}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="sp-del"
                          onClick={() => removeItem(sp.sparepartId)}
                          title="Hapus barang"
                        >
                          ×
                        </button>
                      </div>

                      {/* Baris Tengah: Pilihan Mesin & Qty */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 12,
                          alignItems: 'center',
                          marginTop: 4,
                        }}
                      >
                        {/* Selector Mesin */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--tx2)',
                              textTransform: 'uppercase',
                              letterSpacing: '.5px',
                            }}
                          >
                            ⚙️ Peruntukan Mesin:
                          </label>

                          {!sp.isCustomMesin ? (
                            <select
                              className="form-input form-select"
                              style={{ fontSize: 13, padding: '6px 10px' }}
                              value={sp.mesinNama}
                              onChange={(e) => updateItemMesin(sp.sparepartId, e.target.value)}
                            >
                              <option value="">-- Tanpa Mesin / General --</option>
                              {sp.mesins.length > 0 && (
                                <optgroup label="⭐ Mesin dari BOM (Terkait)">
                                  {sp.mesins.map((m) => (
                                    <option key={m.id} value={m.nama}>
                                      {m.nama}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label="🏭 Semua Mesin Master">
                                {allMesins.map((m) => (
                                  <option key={m.id} value={m.nama}>
                                    {m.nama} {m.area ? `(${m.area})` : ''}
                                  </option>
                                ))}
                              </optgroup>
                              <option value="__OTHER__">✏️ Ketik Nama Mesin Lain / Custom...</option>
                            </select>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Ketik nama mesin..."
                                autoFocus
                                style={{ fontSize: 13, padding: '6px 10px' }}
                                value={sp.mesinNama}
                                onChange={(e) =>
                                  setForm((p) => ({
                                    ...p,
                                    items: p.items.map((s) =>
                                      s.sparepartId === sp.sparepartId
                                        ? { ...s, mesinNama: e.target.value }
                                        : s
                                    ),
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => updateItemMesin(sp.sparepartId, '')}
                              >
                                Pilih dari List
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Pengatur Qty */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--tx2)',
                              textTransform: 'uppercase',
                              letterSpacing: '.5px',
                            }}
                          >
                            Jumlah ({sp.uom}):
                          </label>
                          <div className="qty-ctrl">
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => updateQty(sp.sparepartId, -1)}
                            >
                              −
                            </button>
                            <input type="text" className="qty-val" value={sp.qty} readOnly />
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => updateQty(sp.sparepartId, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div
            className="card-footer"
            style={{
              padding: 20,
              borderTop: '1px solid var(--br)',
              background: 'var(--sf2)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button type="submit" className="btn btn-ylw btn-lg" disabled={submitting}>
              {submitting ? 'Menyimpan Transaksi...' : '📤 Keluarkan Barang'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal Pilih Barang */}
      {spModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSpModalOpen(false);
          }}
        >
          <div className="modal-box" style={{ height: '80vh', maxWidth: 650 }}>
            <div className="modal-header">
              <div className="modal-title">Pilih Barang dari Stok</div>
              <button
                onClick={() => setSpModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--tx2)',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--br)' }}>
                <div className="search-bar">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Cari sparepart berdasarkan ID, Nama, atau Lokasi..."
                    value={spSearch}
                    onChange={(e) => setSpSearch(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {filteredSP.map((sp) => (
                      <tr
                        key={sp.id}
                        onClick={() => addItem(sp)}
                        style={{ cursor: 'pointer', borderBottom: '1px solid var(--br)' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{sp.nama}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                            ID: {sp.id} · Lokasi: {sp.lokasi || '-'}
                            {sp.mesins && sp.mesins.length > 0 && (
                              <span style={{ marginLeft: 8, color: 'var(--ylw)' }}>
                                ⚙️ {sp.mesins.map((m: any) => m.nama).join(', ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: sp.currentStock > 0 ? 'var(--grn)' : 'var(--red)',
                            }}
                          >
                            {sp.currentStock} {sp.uom}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
