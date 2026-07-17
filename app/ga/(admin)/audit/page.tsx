'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';

type SnapshotMeta = {
  id: number;
  periode: string;
  generatedAt: string;
  cutoffAt: string;
  source: string;
  _count: { lines: number };
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
  qtyFisik: number | null;
  selisih: number | null;
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
};

function statusBadge(line: AuditLine) {
  if (line.qtyFisik == null) return <span className="badge badge-blu">Belum Opname</span>;
  if (line.selisih === 0) return <span className="badge badge-grn">Cocok</span>;
  return <span className="badge badge-red">Selisih</span>;
}

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

export default function GaAuditPage() {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotMeta | null>(null);
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [periode, setPeriode] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
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
      if (status) q.set('status', status);
      const res = await fetch('/api/ga/audit?' + q.toString());
      const json = await res.json();
      if (json.success) {
        setSnapshots(json.data.snapshots || []);
        setSnapshot(json.data.snapshot || null);
        setLines(json.data.lines || []);
        if (!periode && json.data.snapshot?.periode) {
          setPeriode(json.data.snapshot.periode);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [periode, search, status]);

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
              Snapshot stok sistem vs stock opname per bulan (generate H-1 akhir bulan 00:00 WIB)
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={generating}
            onClick={() => handleGenerate(false)}
          >
            {generating ? 'Generating…' : 'Generate Sekarang'}
          </button>
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
                    {s.periode} ({s._count.lines} barang)
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
            <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
              <label className="form-label">Status</label>
              <select
                className="form-input form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Semua</option>
                <option value="cocok">Cocok</option>
                <option value="selisih">Selisih</option>
                <option value="belum_opname">Belum Opname</option>
              </select>
            </div>
          </div>
          {snapshot && (
            <div className="text-muted text-tiny" style={{ marginTop: 10 }}>
              Digenerate: {formatDt(snapshot.generatedAt)} · Cutoff:{' '}
              {formatDt(snapshot.cutoffAt)} · Sumber: {snapshot.source}
            </div>
          )}
        </div>

        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Barang</th>
                <th>Lokasi</th>
                <th style={{ textAlign: 'right' }}>Saldo Awal</th>
                <th style={{ textAlign: 'right' }}>IN</th>
                <th style={{ textAlign: 'right' }}>OUT</th>
                <th style={{ textAlign: 'right' }}>ADJ</th>
                <th style={{ textAlign: 'right' }}>Stok Sistem</th>
                <th style={{ textAlign: 'right' }}>Stok Fisik</th>
                <th style={{ textAlign: 'right' }}>Selisih</th>
                <th>Status</th>
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
                    <td style={{ textAlign: 'right' }}>
                      {line.qtyFisik == null ? '—' : line.qtyFisik}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color:
                          line.selisih == null
                            ? undefined
                            : line.selisih === 0
                              ? 'var(--green, #16a34a)'
                              : 'var(--red, #dc2626)',
                      }}
                    >
                      {line.selisih == null
                        ? '—'
                        : line.selisih > 0
                          ? `+${line.selisih}`
                          : line.selisih}
                    </td>
                    <td>{statusBadge(line)}</td>
                  </tr>
                  {expandedId === line.itemId && (
                    <tr>
                      <td
                        colSpan={11}
                        style={{ background: 'var(--surface-2, #f8fafc)', padding: 12 }}
                      >
                        {loadingMovements ? (
                          <div className="text-muted">Memuat transaksi…</div>
                        ) : movements.length === 0 ? (
                          <div className="text-muted">Tidak ada transaksi pada periode ini.</div>
                        ) : (
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Tanggal</th>
                                <th>Tipe</th>
                                <th style={{ textAlign: 'right' }}>Qty</th>
                                <th>PIC</th>
                                <th>Keterangan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movements.map((m) => (
                                <tr key={m.id}>
                                  <td>
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
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && lines.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-muted" style={{ textAlign: 'center' }}>
                    {snapshots.length === 0
                      ? 'Belum ada snapshot. Klik "Generate Sekarang" atau tunggu cron H-1 akhir bulan.'
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
