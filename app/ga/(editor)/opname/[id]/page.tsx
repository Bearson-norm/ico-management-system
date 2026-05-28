'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  buildLokasiProgress,
  formatIncompleteLokasiMessage,
  LOKASI_ALL,
  normalizeLokasiKey,
  type LokasiProgress,
} from '@/lib/ga/opnameProgress';

type Line = {
  id: number;
  itemId: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  uom: string;
  qtySistem: number;
  qtyFisik: number | null;
  picNama: string | null;
  selisih: number | null;
  counted: boolean;
};

type Session = {
  id: number;
  periodeNama: string;
  lokasi: string | null;
  status: string;
  tanggal: string;
  postedAt: string | null;
  postMode: 'in_out' | 'adj' | null;
  lineCount: number;
  countedCount: number;
  varianceCount: number;
};

export default function GaOpnameDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'uncounted' | 'variance'>('all');
  const [activeLokasi, setActiveLokasi] = useState(LOKASI_ALL);
  const [postForm, setPostForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    picNama: '',
    postMode: 'in_out' as 'in_out' | 'adj',
  });
  const [postModal, setPostModal] = useState(false);

  const isDraft = session?.status === 'draft';

  function isLineCounted(l: Line) {
    if (!isDraft) return l.counted;
    const raw = draft[l.id];
    return raw !== '' && raw != null;
  }

  const lokasiProgress = useMemo((): LokasiProgress[] => {
    return buildLokasiProgress(
      lines.map((l) => ({ lokasi: l.lokasi, counted: isLineCounted(l) }))
    );
  }, [lines, draft, isDraft]);

  const allGedungComplete =
    session != null && lokasiProgress.length > 0 && lokasiProgress.every((p) => p.complete);
  const incompleteMsg = formatIncompleteLokasiMessage(lokasiProgress);

  const linesForLokasi = useMemo(() => {
    if (activeLokasi === LOKASI_ALL) return lines;
    return lines.filter((l) => normalizeLokasiKey(l.lokasi) === activeLokasi);
  }, [lines, activeLokasi]);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ga/opname/${id}`);
      const j = await res.json();
      if (j.success) {
        setSession(j.data.session);
        setLines(j.data.lines);
        const d: Record<number, string> = {};
        for (const l of j.data.lines as Line[]) {
          d[l.id] = l.qtyFisik != null ? String(l.qtyFisik) : '';
        }
        setDraft(d);
        setPostForm((f) => ({ ...f, tanggal: j.data.session.tanggal }));
      } else {
        setErr(j.error || 'Gagal memuat');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return linesForLokasi.filter((l) => {
      if (filter === 'uncounted' && isLineCounted(l)) return false;
      if (filter === 'variance') {
        const raw = isDraft ? draft[l.id] : String(l.qtyFisik ?? '');
        if (raw === '') return false;
        const fisik = parseInt(raw, 10);
        if (!Number.isFinite(fisik) || fisik - l.qtySistem === 0) return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        l.nama.toLowerCase().includes(q) ||
        l.itemId.toLowerCase().includes(q) ||
        (l.kodeBarang?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [linesForLokasi, search, filter, draft, isDraft]);

  const stats = useMemo(() => {
    const counted = lines.filter((l) => isLineCounted(l)).length;
    let surplus = 0;
    let shortage = 0;
    for (const l of lines) {
      const raw = draft[l.id];
      if (raw === '' || raw == null) continue;
      const fisik = parseInt(raw, 10);
      if (!Number.isFinite(fisik)) continue;
      const diff = fisik - l.qtySistem;
      if (diff > 0) surplus++;
      if (diff < 0) shortage++;
    }
    return { counted, surplus, shortage };
  }, [lines, draft]);

  async function saveLines(targetIds?: number[]) {
    if (!isDraft) return;
    const target = targetIds ? lines.filter((l) => targetIds.includes(l.id)) : lines;
    const updates = target.map((l) => {
      const raw = draft[l.id];
      const qtyFisik = raw === '' || raw == null ? null : Math.max(0, parseInt(raw, 10) || 0);
      return { id: l.id, qtyFisik };
    });

    if (updates.length === 0) return;

    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/ga/opname/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: updates }),
    });
    const j = await res.json();
    setSaving(false);
    if (j.success) {
      setSession(j.data.session);
      setLines(j.data.lines);
      const d: Record<number, string> = {};
      for (const l of j.data.lines as Line[]) {
        d[l.id] = l.qtyFisik != null ? String(l.qtyFisik) : '';
      }
      setDraft(d);
      setMsg('Perubahan disimpan');
      setTimeout(() => setMsg(null), 2500);
    } else {
      setErr(j.error || 'Gagal menyimpan');
    }
  }

  function setQty(lineId: number, value: string) {
    if (!isDraft) return;
    setDraft((d) => ({ ...d, [lineId]: value.replace(/[^\d]/g, '') }));
  }

  function markSameAsSystem(line: Line) {
    setDraft((d) => ({ ...d, [line.id]: String(line.qtySistem) }));
  }

  async function saveAll(e?: FormEvent) {
    e?.preventDefault();
    await saveLines();
  }

  async function saveCurrentLokasi() {
    const ids = linesForLokasi.map((l) => l.id);
    await saveLines(ids);
  }

  function fillCocokForLokasi() {
    const next = { ...draft };
    for (const l of linesForLokasi) {
      if (draft[l.id] === '') next[l.id] = String(l.qtySistem);
    }
    setDraft(next);
  }

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (!allGedungComplete) {
      alert(incompleteMsg || 'Semua gedung harus selesai dihitung sebelum posting.');
      return;
    }
    if (!postForm.picNama.trim()) return alert('PIC wajib');
    await saveLines();
    setPosting(true);
    setErr(null);
    const res = await fetch(`/api/ga/opname/${id}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postForm),
    });
    const j = await res.json();
    setPosting(false);
    if (j.success) {
      setPostModal(false);
      setMsg(j.data.msg);
      await load();
    } else {
      setErr(j.error || 'Gagal posting');
    }
  }

  function selisihBadge(line: Line, fisikRaw: string) {
    if (fisikRaw === '') return <span className="badge" style={{ opacity: 0.5 }}>—</span>;
    const fisik = parseInt(fisikRaw, 10);
    if (!Number.isFinite(fisik)) return null;
    const diff = fisik - line.qtySistem;
    if (diff === 0) return <span className="badge badge-grn">Cocok</span>;
    if (diff > 0) return <span className="badge badge-ylw">+{diff}</span>;
    return <span className="badge badge-red">{diff}</span>;
  }

  if (loading) return <div className="ga-loading">Memuat…</div>;
  if (!session) {
    return (
      <div className="page-body">
        <p>{err || 'Sesi tidak ditemukan'}</p>
        <Link href="/ga/opname" className="btn btn-ghost">
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Link href="/ga/opname" style={{ fontSize: 13, color: 'var(--ga-tx2)' }}>
              ← Daftar opname
            </Link>
            <div className="page-title" style={{ marginTop: 8 }}>
              {session.periodeNama}
            </div>
            <div className="page-sub">
              Semua gedung · {session.tanggal}
              {isDraft && !allGedungComplete && (
                <span style={{ display: 'block', marginTop: 4, color: 'var(--ga-ylw)' }}>
                  Posting terkunci sampai seluruh gedung selesai dihitung
                </span>
              )}
              {session.status === 'posted' && session.postedAt
                ? ` · Diposting ${new Date(session.postedAt).toLocaleString('id-ID')}`
                : ''}
            </div>
          </div>
          {isDraft && (
            <div className="ga-page-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => saveLines()} disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan draft'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPostModal(true)}
                disabled={!allGedungComplete}
                title={
                  allGedungComplete
                    ? 'Posting penyesuaian ke stok'
                    : incompleteMsg || 'Selesaikan hitung di semua gedung'
                }
              >
                Posting selisih
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="page-body">
        {msg && <div className="ga-alert-success" style={{ marginBottom: 12 }}>{msg}</div>}
        {err && <div className="ga-alert-error" style={{ marginBottom: 12 }}>{err}</div>}

        {isDraft && lokasiProgress.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ga-tx2)', marginBottom: 10 }}>
              Pilih gedung untuk mengisi qty fisik
            </div>
            <div className="ga-opname-lokasi-tabs" role="tablist" aria-label="Gedung opname">
              <button
                type="button"
                role="tab"
                aria-selected={activeLokasi === LOKASI_ALL}
                className={`ga-opname-lokasi-tab${activeLokasi === LOKASI_ALL ? ' ga-opname-lokasi-tab--active' : ''}`}
                onClick={() => setActiveLokasi(LOKASI_ALL)}
              >
                Semua
                <span className="ga-opname-lokasi-tab-count">
                  {stats.counted}/{session.lineCount}
                </span>
              </button>
              {lokasiProgress.map((p) => (
                <button
                  key={p.lokasi}
                  type="button"
                  role="tab"
                  aria-selected={activeLokasi === p.lokasi}
                  className={`ga-opname-lokasi-tab${activeLokasi === p.lokasi ? ' ga-opname-lokasi-tab--active' : ''}${p.complete ? ' ga-opname-lokasi-tab--done' : ''}`}
                  onClick={() => setActiveLokasi(p.lokasi)}
                >
                  {p.lokasi}
                  <span className="ga-opname-lokasi-tab-count">
                    {p.counted}/{p.total}
                    {p.complete ? ' ✓' : ''}
                  </span>
                </button>
              ))}
            </div>
            {!allGedungComplete && incompleteMsg && (
              <p style={{ fontSize: 12, color: 'var(--ga-ylw)', marginTop: 10, marginBottom: 0 }}>
                {incompleteMsg}
              </p>
            )}
          </div>
        )}

        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ga-tx2)' }}>Sudah dihitung</div>
            <strong style={{ fontSize: 22 }}>
              {isDraft ? stats.counted : session.countedCount} / {session.lineCount}
            </strong>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ga-tx2)' }}>Lebih (surplus)</div>
            <strong style={{ fontSize: 22, color: 'var(--ga-ylw)' }}>
              {isDraft ? stats.surplus : '—'}
            </strong>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ga-tx2)' }}>Kurang (shortage)</div>
            <strong style={{ fontSize: 22, color: 'var(--ga-red)' }}>
              {isDraft ? stats.shortage : session.varianceCount}
            </strong>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--ga-tx2)' }}>Status</div>
            <strong>
              {session.status === 'posted' ? (
                <span className="badge badge-grn">Selesai</span>
              ) : (
                <span className="badge badge-ylw">Draft</span>
              )}
            </strong>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header">
            <div className="filter-row" style={{ marginBottom: 0, width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
                <input
                  type="text"
                  placeholder="Cari barang…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="form-input form-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">Semua</option>
                <option value="uncounted">Belum dihitung</option>
                <option value="variance">Ada selisih</option>
              </select>
              {isDraft && activeLokasi !== LOKASI_ALL && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={fillCocokForLokasi}>
                    Cocok = sistem (gedung ini)
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={saveCurrentLokasi} disabled={saving}>
                    Simpan gedung ini
                  </button>
                </>
              )}
            </div>
          </div>
          <form onSubmit={saveAll}>
            <div className="table-wrap ga-opname-table">
              <table>
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th>Lokasi</th>
                    <th>Sistem</th>
                    <th>Fisik</th>
                    <th>Selisih</th>
                    {isDraft && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div>{l.nama}</div>
                        <div style={{ fontSize: 11, color: 'var(--ga-tx2)' }}>
                          {l.kodeBarang || l.itemId}
                        </div>
                      </td>
                      <td>{l.lokasi}</td>
                      <td>
                        <strong>{l.qtySistem}</strong> {l.uom}
                      </td>
                      <td>
                        {isDraft ? (
                          <input
                            type="number"
                            min={0}
                            className="form-input ga-opname-qty-input"
                            style={{ width: 88 }}
                            placeholder="—"
                            value={draft[l.id] ?? ''}
                            onChange={(e) => setQty(l.id, e.target.value)}
                            onBlur={() => {
                              if (draft[l.id] !== '' && draft[l.id] != null) saveLines([l.id]);
                            }}
                          />
                        ) : (
                          <strong>{l.qtyFisik ?? '—'}</strong>
                        )}
                      </td>
                      <td>{selisihBadge(l, isDraft ? (draft[l.id] ?? '') : String(l.qtyFisik ?? ''))}</td>
                      {isDraft && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Anggap sama dengan sistem"
                            onClick={() => {
                              markSameAsSystem(l);
                            }}
                          >
                            =
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isDraft && (
              <div className="card-footer" style={{ padding: 16, borderTop: '1px solid var(--ga-br)' }}>
                <button type="submit" className="btn btn-ghost" disabled={saving}>
                  Simpan semua
                </button>
              </div>
            )}
          </form>
        </div>

        {session.status === 'posted' && (
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ga-tx2)' }}>
            Penyesuaian dicatat di Riwayat sebagai{' '}
            {session.postMode === 'adj'
              ? 'gerakan ADJ (penyesuaian opname)'
              : 'Stock In / Stock Out'}{' '}
            dengan keterangan opname.
          </p>
        )}
      </div>

      {postModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Posting penyesuaian stok</div>
            </div>
            <form onSubmit={onPost}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--ga-tx2)', marginBottom: 16 }}>
                  Semua gedung sudah dihitung ({session.lineCount} barang). Pilih cara mencatat selisih ke stok.
                </p>
                <div className="form-group">
                  <label className="form-label">Metode penyesuaian</label>
                  <div className="ga-opname-post-modes" role="radiogroup" aria-label="Metode penyesuaian">
                    <label className={`ga-opname-post-mode${postForm.postMode === 'in_out' ? ' ga-opname-post-mode--active' : ''}`}>
                      <input
                        type="radio"
                        name="postMode"
                        value="in_out"
                        checked={postForm.postMode === 'in_out'}
                        onChange={() => setPostForm({ ...postForm, postMode: 'in_out' })}
                      />
                      <span className="ga-opname-post-mode-title">Stock In / Out</span>
                      <span className="ga-opname-post-mode-desc">
                        Selisih + dicatat masuk (IN), selisih − dicatat keluar (OUT). Cocok jika ingin terpisah di laporan inbound/outbound.
                      </span>
                    </label>
                    <label className={`ga-opname-post-mode${postForm.postMode === 'adj' ? ' ga-opname-post-mode--active' : ''}`}>
                      <input
                        type="radio"
                        name="postMode"
                        value="adj"
                        checked={postForm.postMode === 'adj'}
                        onChange={() => setPostForm({ ...postForm, postMode: 'adj' })}
                      />
                      <span className="ga-opname-post-mode-title">Adjustment (ADJ)</span>
                      <span className="ga-opname-post-mode-desc">
                        Satu gerakan ADJ per barang (qty bertanda +/−). Tampil terpisah di riwayat, tidak tercampur pembelian/pengeluaran harian.
                      </span>
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Tanggal penyesuaian <span className="req">*</span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={postForm.tanggal}
                    onChange={(e) => setPostForm({ ...postForm, tanggal: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    PIC <span className="req">*</span>
                  </label>
                  <input
                    className="form-input"
                    placeholder="Nama petugas opname"
                    value={postForm.picNama}
                    onChange={(e) => setPostForm({ ...postForm, picNama: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPostModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={posting}>
                  {posting ? 'Memproses…' : 'Posting ke stok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
