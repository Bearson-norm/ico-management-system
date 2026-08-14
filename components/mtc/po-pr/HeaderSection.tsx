import React from 'react';

type HeaderSectionProps = {
  showRequestForm: boolean;
  setShowRequestForm: (val: boolean) => void;
  actionLoading: string | null;
  handleOneClickSync: () => void;
  openSettingsModal: () => void;
};

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  showRequestForm,
  setShowRequestForm,
  actionLoading,
  handleOneClickSync,
  openSettingsModal,
}) => {
  return (
    <div
      className="page-header"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <div>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>🔍</span> Asisten Pelacakan PR / PO (SCM Sync)
        </div>
        <div className="page-sub">
          Kelola pengadaan suku cadang mesin, sinkronkan Google Sheets SCM, dan catat penerimaan barang langsung.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-pur"
          onClick={() => setShowRequestForm(!showRequestForm)}
          style={{
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 16px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)',
            border: 'none',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
            cursor: 'pointer',
          }}
        >
          {showRequestForm ? '✖ Tutup Form PR' : '➕ Buat Pengajuan PR'}
        </button>

        <div
          style={{
            display: 'flex',
            background: 'var(--sf2)',
            borderRadius: 8,
            padding: 3,
            border: '1px solid var(--br)',
            gap: 4,
          }}
        >
          <button
            type="button"
            className="btn btn-grn"
            disabled={actionLoading === 'sync-main'}
            onClick={handleOneClickSync}
            style={{
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 14px',
              fontSize: 12,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {actionLoading === 'sync-main' ? (
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
                    marginRight: 4,
                  }}
                />
                Menyinkronkan...
              </>
            ) : (
              '🔄 Sinkronkan Data'
            )}
          </button>
          <button
            type="button"
            onClick={openSettingsModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 0.15s',
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            title="Pengaturan Koneksi Google Sheets / CSV"
          >
            ⚙️
          </button>
        </div>
      </div>
    </div>
  );
};
