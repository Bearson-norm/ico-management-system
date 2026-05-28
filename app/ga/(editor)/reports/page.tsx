export default function GaReportsPage() {
  const base = '/api/ga/export';
  return (
    <>
      <div className="page-header">
        <div className="page-title">Export CSV</div>
        <div className="page-sub">Header mengikuti template laporan GA</div>
      </div>
      <div className="page-body">
        <div className="card" style={{ padding: 20, maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a className="btn btn-primary" href={`${base}?type=inbound`}>
            Unduh Inbound
          </a>
          <a className="btn btn-primary" href={`${base}?type=outbound`}>
            Unduh Outbound
          </a>
          <a className="btn btn-ghost" href={`${base}?type=report`}>
            Unduh Laporan Stok (ringkas)
          </a>
        </div>
      </div>
    </>
  );
}
