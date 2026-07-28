'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';

type SnapshotMeta = {
  id: number;
  periode: string;
  generatedAt: string;
  cutoffAt: string;
  source: string;
  _count?: { lines: number };
};

type AuditLine = {
  id: number;
  itemId: string;
  namaItem: string;
  uom: string;
  lokasi: string | null;
  saldoAwal: number;
  totalIn: number;
  totalOut: number;
  totalAdj: number;
  stokSistem: number;
  jumlahTransaksi: number;
};

type Movement = {
  id: number;
  tipe: string;
  qty: number;
  tanggal: string;
  picNama: string | null;
  keterangan: string | null;
  purchaseType: string | null;
  vendor: string | null;
  backdate?: boolean;
};

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

export default function GaAuditPage() {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotMeta | null>(null);
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [backdateItemIds, setBackdateItemIds] = useState<string[]>([]);
  const [periode, setPeriode] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (periode) q.set('periode', periode);
      if (search) q.set('search', search);
      const res = await fetch('/api/ga/audit?' + q.toString());
      const json = await res.json();
      if (json.success) {
        setSnapshots(json.data.snapshots || []);
        setSnapshot(json.data.snapshot || null);
        setLines(json.data.lines || []);
        setBackdateItemIds(json.data.backdateItemIds || []);
        if (!periode && json.data.snapshot?.periode) {
          setPeriode(json.data.snapshot.periode);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [periode, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleGenerate(force = false) {
    const msg = force
      ? 'Regenerate akan menimpa snapshot periode ini. Lanjutkan?'
      : 'Generate snapshot audit untuk periode berjalan sekarang?';
    if (!confirm(msg)) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ga/audit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, source: 'manual', ...(periode ? { periode } : {}) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (res.status === 409) {
          if (confirm(json.error + '\n\nRegenerate dengan force?')) {
            await handleGenerate(true);
          }
          return;
        }
        alert('Error: ' + (json.error || 'Gagal generate'));
        return;
      }
      if (json.data?.periode) setPeriode(json.data.periode);
      await fetchData();
      alert(`Snapshot ${json.data.periode} berhasil digenerate (${json.data.lineCount} barang).`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!snapshot) return;
    const lineCount = snapshot._count?.lines ?? lines.length;
    if (
      !confirm(
        `Hapus snapshot audit periode ${snapshot.periode} (${lineCount} barang)?\n\n` +
          'Periode ini akan kembali terbuka untuk transaksi (soft lock hilang) sampai snapshot digenerate ulang.'
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/ga/audit?periode=${snapshot.periode}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert('Error: ' + (json.error || 'Gagal menghapus snapshot'));
        return;
      }
      alert(json.data.msg);
      setPeriode('');
      setExpandedId(null);
      await fetchData();
    } finally {
      setGenerating(false);
    }
  }

  async function toggleExpand(line: AuditLine) {
    if (expandedId === line.itemId) {
      setExpandedId(null);
      setMovements([]);
      return;
    }
    setExpandedId(line.itemId);
    setLoadingMovements(true);
    try {
      const q = new URLSearchParams({
        periode: snapshot?.periode || periode,
        itemId: line.itemId,
      });
      const res = await fetch('/api/ga/audit/movements?' + q.toString());
      const json = await res.json();
      if (json.success) setMovements(json.data.movements || []);
      else setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Cek Audit Trail</div>
            <div className="page-sub">
              Snapshot pergerakan stok sistem per bulan (generate H-2 akhir bulan 00:00 WIB, geser otomatis jika libur) — hasil fisik lihat di Stock Opname
            </div>
          </div>
          <div className="page-header-actions" style={{ display: 'flex', gap: 8 }}>
            <a
              className="btn btn-ghost"
              href={periode ? `/api/ga/audit/export?periode=${periode}` : undefined}
              aria-disabled={!periode}
              onClick={(e) => {
                if (!periode) e.preventDefault();
              }}
              style={{ pointerEvents: periode ? 'auto' : 'none', opacity: periode ? 1 : 0.5 }}
            >
              Unduh PDF
            </a>
            <button
              className="btn btn-ghost"
              disabled={generating || !snapshot}
              onClick={handleDelete}
              style={{ color: 'var(--red)' }}
              title={snapshot ? `Hapus snapshot ${snapshot.periode}` : 'Pilih snapshot dulu'}
            >
              Hapus Snapshot
            </button>
            <button
              className="btn btn-primary"
              disabled={generating}
              onClick={() => handleGenerate(false)}
            >
              {generating ? 'Generating…' : 'Generate Sekarang'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="search-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
              <label className="form-label">Periode</label>
              <select
                className="form-input form-select"
                value={periode}
                onChange={(e) => {
                  setPeriode(e.target.value);
                  setExpandedId(null);
                }}
              >
                {snapshots.length === 0 && <option value="">Belum ada snapshot</option>}
                {snapshots.map((s) => (
                  <option key={s.id} value={s.periode}>
                    {s.periode} ({s._count?.lines ?? 0} barang)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
              <label className="form-label">Cari barang</label>
              <input
                className="form-input"
                placeholder="Nama / kode / lokasi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {snapshot && (
            <div className="text-muted text-tiny" style={{ marginTop: 10 }}>
              Digenerate: {formatDt(snapshot.generatedAt)} · Cutoff:{' '}
              {formatDt(snapshot.cutoffAt)} · Sumber: {snapshot.source}
            </div>
          )}
        </div>

        <div className="card table-wrap table-wrap-x">
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Barang</th>
                <th>Lokasi</th>
                <th style={{ textAlign: 'right' }}>Saldo Awal</th>
                <th style={{ textAlign: 'right' }}>IN</th>
                <th style={{ textAlign: 'right' }}>OUT</th>
                <th style={{ textAlign: 'right' }}>ADJ</th>
                <th style={{ textAlign: 'right' }}>Stok Sistem</th>
                <th>Integritas</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading ? 0.5 : 1 }}>
              {lines.map((line) => (
                <Fragment key={line.id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleExpand(line)}
                        title="Lihat transaksi"
                      >
                        {expandedId === line.itemId ? '▾' : '▸'}
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{line.namaItem}</div>
                      <div className="text-muted text-tiny">
                        {line.itemId} · {line.uom} · {line.jumlahTransaksi} trx
                      </div>
                    </td>
                    <td>{line.lokasi || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{line.saldoAwal}</td>
                    <td style={{ textAlign: 'right' }}>{line.totalIn}</td>
                    <td style={{ textAlign: 'right' }}>{line.totalOut}</td>
                    <td style={{ textAlign: 'right' }}>{line.totalAdj}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.stokSistem}</td>
                    <td>
                      {backdateItemIds.includes(line.itemId) ? (
                        <span
                          className="badge badge-ylw"
                          title="Ada transaksi yang dicatat setelah periode di-closing"
                        >
                          Backdate
                        </span>
                      ) : (
                        <span className="badge badge-grn">Sesuai Closing</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === line.itemId && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{ background: 'var(--sf2)', padding: 12 }}
                      >
                        {loadingMovements ? (
                          <div className="text-muted">Memuat transaksi…</div>
                        ) : movements.length === 0 ? (
                          <div className="text-muted">Tidak ada transaksi pada periode ini.</div>
                        ) : (
                          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', minWidth: 560 }}>
                              <thead>
                                <tr>
                                  <th>Tanggal</th>
                                  <th>Tipe</th>
                                  <th style={{ textAlign: 'right' }}>Qty</th>
                                  <th>PIC</th>
                                  <th>Keterangan</th>
                                  <th>Pencatatan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {movements.map((m) => (
                                  <tr key={m.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      {new Date(m.tanggal).toLocaleString('id-ID', {
                                        timeZone: 'Asia/Jakarta',
                                      })}
                                    </td>
                                    <td>
                                      <span
                                        className={`badge ${
                                          m.tipe === 'IN'
                                            ? 'badge-grn'
                                            : m.tipe === 'OUT'
                                              ? 'badge-red'
                                              : 'badge-blu'
                                        }`}
                                      >
                                        {m.tipe}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{m.qty}</td>
                                    <td>{m.picNama || '—'}</td>
                                    <td>
                                      {[m.purchaseType, m.vendor, m.keterangan]
                                        .filter(Boolean)
                                        .join(' · ') || '—'}
                                    </td>
                                    <td>
                                      {m.backdate ? (
                                        <span
                                          className="badge badge-ylw"
                                          title="Dicatat setelah periode di-closing"
                                        >
                                          Backdate
                                        </span>
                                      ) : (
                                        <span className="text-muted text-tiny">Normal</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && lines.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-muted" style={{ textAlign: 'center' }}>
                    {snapshots.length === 0
                      ? 'Belum ada snapshot. Klik "Generate Sekarang" atau tunggu cron H-2 akhir bulan (geser otomatis jika libur).'
                      : 'Tidak ada baris yang cocok dengan filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
