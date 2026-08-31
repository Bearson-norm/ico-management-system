import React from 'react';

type HeaderSectionProps = {
  actionLoading: string | null;
  handleOneClickSync: () => void;
  openSettingsModal: () => void;
};

export const HeaderSection: React.FC<HeaderSectionProps> = ({
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
        marginBottom: 20,
      }}
    >
      <div>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>📦</span> Pelacakan Pengadaan & Penerimaan Barang MTC (Odoo Hub)
        </div>
        <div className="page-sub">
          Pantau status dokumen PR/TE, PO, riwayat pesan Chatter Odoo, dan kelola penerimaan barang fisik ke stok gudang.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-grn"
          disabled={actionLoading === 'sync-main'}
          onClick={handleOneClickSync}
          style={{
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 18px',
            fontSize: 13,
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
          }}
        >
          {actionLoading === 'sync-main' ? (
            <>
              <span
                className="spinner"
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginRight: 4,
                }}
              />
              Menyinkronkan Odoo...
            </>
          ) : (
            '⚡ Sinkronkan Odoo Cloud'
          )}
        </button>

        <button
          type="button"
          onClick={openSettingsModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            border: '1px solid var(--br)',
            background: 'var(--sf2)',
            cursor: 'pointer',
            fontSize: 18,
            transition: 'all 0.15s',
            borderRadius: 8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf2)')}
          title="Pengaturan Kredensial Odoo (Session ID)"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};
