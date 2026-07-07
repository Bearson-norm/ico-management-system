'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  event: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_commit: {
    message: string;
    author: {
      name: string;
    };
  } | null;
}

export default function GitHubActionsPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canTrigger, setCanTrigger] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState('');

  const fetchRuns = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mtc/github/actions');
      const json = await res.json();
      if (json.success) {
        setRuns(json.data);
        setCanTrigger(json.canTrigger);
      } else {
        setError(json.error || 'Gagal memuat data workflow dari GitHub');
      }
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan koneksi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleTriggerDeploy = async () => {
    if (!confirm('Apakah Anda yakin ingin memicu deploy ulang ke VPS sekarang?')) return;
    setTriggering(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/mtc/github/actions', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message || 'Deployment berhasil dipicu! Tunggu beberapa saat lalu refresh halaman ini.');
        setTimeout(fetchRuns, 3000);
      } else {
        setError(json.error || 'Gagal memicu deployment');
      }
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan koneksi saat memicu deploy');
    } finally {
      setTriggering(false);
    }
  };

  const getStatusBadge = (run: WorkflowRun) => {
    if (run.status !== 'completed') {
      return <span className="badge badge-org">🔄 {run.status.toUpperCase()}</span>;
    }
    switch (run.conclusion) {
      case 'success':
        return <span className="badge badge-grn">✅ SUCCESS</span>;
      case 'failure':
        return <span className="badge badge-red">❌ FAILURE</span>;
      case 'cancelled':
        return <span className="badge" style={{ backgroundColor: 'var(--border)', color: 'var(--tx2)' }}>🚫 CANCELLED</span>;
      default:
        return <span className="badge badge-blu">{run.conclusion?.toUpperCase() || 'COMPLETED'}</span>;
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="flex-between">
          <div>
            <h1 className="page-title">CI/CD & GitHub Deploy MTC</h1>
            <p className="page-sub">Pantau status deployment otomatis ke VPS via GitHub Actions</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={fetchRuns}
              className="btn btn-ghost"
              disabled={loading}
            >
              🔄 Refresh
            </button>
            {canTrigger ? (
              <button
                onClick={handleTriggerDeploy}
                className="btn btn-primary"
                disabled={triggering || loading}
              >
                {triggering ? '⚡ Memproses...' : '⚡ Trigger Deploy VPS'}
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ cursor: 'not-allowed', color: 'var(--tx3)', border: '1px dashed var(--border)' }}
                title="Atur GITHUB_TOKEN atau GITHUB_PAT di file .env untuk mengaktifkan trigger manual langsung dari aplikasi"
                disabled
              >
                🔒 Trigger Deploy (Token Needed)
              </button>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className="alert alert-blu" style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', flex: 1 }}>{message}</div>
        </div>
      )}

      {error && (
        <div className="alert alert-red" style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', flex: 1 }}><strong>Error:</strong> {error}</div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '16px', fontWeight: 800 }}>Daftar Workflow Runs Terbaru</h2>
        </div>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Workflow Name</th>
                <th>Status</th>
                <th>Trigger Event</th>
                <th>Commit Message</th>
                <th>Triggered By</th>
                <th>Date / Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--tx3)' }}>
                    Memuat data run dari GitHub API...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--tx3)' }}>
                    Tidak ada workflow runs ditemukan.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span style={{ fontWeight: 'bold' }}>{run.name}</span>
                      <div className="text-tiny text-muted">ID: {run.id}</div>
                    </td>
                    <td>{getStatusBadge(run)}</td>
                    <td>
                      <span className="badge badge-blu" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                        {run.event}
                      </span>
                    </td>
                    <td style={{ maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span title={run.head_commit?.message}>
                        {run.head_commit?.message || '—'}
                      </span>
                    </td>
                    <td>{run.head_commit?.author?.name || 'GitHub'}</td>
                    <td>
                      {new Date(run.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <Link
                        href={run.html_url}
                        target="_blank"
                        className="btn btn-ghost btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        Lihat Log ↗
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
