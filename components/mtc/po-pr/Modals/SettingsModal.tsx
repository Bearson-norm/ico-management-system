import React from 'react';

type SettingsModalProps = {
  showSettingsModal: boolean;
  setShowSettingsModal: (val: boolean) => void;
  tempOdooPassword: string;
  setTempOdooPassword: (val: string) => void;
  tempOdooDb: string;
  setTempOdooDb: (val: string) => void;
  tempOdooUid: string;
  setTempOdooUid: (val: string) => void;
  tempOdooSessionId: string;
  setTempOdooSessionId: (val: string) => void;
  handleSaveSettings: (e: React.FormEvent) => void;
  manualSyncStatus: { type: 'success' | 'error'; msg: string } | null;
  actionLoading: string | null;
  handleClearAllProcurementData: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  showSettingsModal,
  setShowSettingsModal,
  tempOdooPassword,
  setTempOdooPassword,
  tempOdooDb,
  setTempOdooDb,
  tempOdooUid,
  setTempOdooUid,
  tempOdooSessionId,
  setTempOdooSessionId,
  handleSaveSettings,
  manualSyncStatus,
  actionLoading,
  handleClearAllProcurementData,
}) => {
  if (!showSettingsModal) return null;

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
          maxWidth: 580,
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
          <div className="card-title" style={{ fontSize: 15, fontWeight: 800, color: 'var(--pur)', margin: 0 }}>
            ⚙️ Pengaturan Koneksi Odoo Cloud ERP
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSettingsModal(false)}
            style={{ fontSize: 16, cursor: 'pointer' }}
          >
            ✖
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <form onSubmit={handleSaveSettings} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--pur)', marginBottom: 12 }}>
              🔑 KREDENSIAL ODOO CLOUD (FOOMX)
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12, color: 'var(--txt)' }}>
                Cookie Session ID (Odoo Browser Session) ⭐
              </label>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 6 }}>
                Ambil dari Cookie Browser <code style={{ color: 'var(--pur)' }}>session_id</code> saat login di foomx.odoo.com.
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="Tempelkan session_id dari Cookie Browser Odoo..."
                value={tempOdooSessionId}
                onChange={(e) => setTempOdooSessionId(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Database Odoo
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={tempOdooDb}
                  onChange={(e) => setTempOdooDb(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  UID Pengguna (Opsional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={tempOdooUid}
                  onChange={(e) => setTempOdooUid(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Password / API Key Odoo (Opsional jika pakai RPC)
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Password akun Odoo jika menggunakan RPC..."
                value={tempOdooPassword}
                onChange={(e) => setTempOdooPassword(e.target.value)}
              />
            </div>

            {manualSyncStatus && (
              <div
                className={`alert ${manualSyncStatus.type === 'success' ? 'alert-grn' : 'alert-red'}`}
                style={{ marginBottom: 12 }}
              >
                {manualSyncStatus.msg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="submit"
                className="btn btn-pur"
                style={{ fontWeight: 800, padding: '0 20px', height: 38, cursor: 'pointer' }}
              >
                💾 Simpan Pengaturan Odoo
              </button>
            </div>
          </form>

          <div style={{ borderTop: '1px dashed var(--br)', margin: '20px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--mut)' }}>
              Ingin membersihkan semua data pelacakan lokal?
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClearAllProcurementData}
              disabled={actionLoading === 'clear-all'}
              style={{
                color: 'var(--red)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 11,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              🗑️ Reset Data Pengadaan Lokal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
