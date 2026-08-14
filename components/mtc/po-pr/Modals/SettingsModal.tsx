import React from 'react';

type SettingsModalProps = {
  showSettingsModal: boolean;
  setShowSettingsModal: (val: boolean) => void;
  tempSheetUrl: string;
  setTempSheetUrl: (val: string) => void;
  tempScriptUrl: string;
  setTempScriptUrl: (val: string) => void;
  tempOdooPassword: string;
  setTempOdooPassword: (val: string) => void;
  tempOdooDb: string;
  setTempOdooDb: (val: string) => void;
  tempOdooUid: string;
  setTempOdooUid: (val: string) => void;
  tempOdooSessionId: string;
  setTempOdooSessionId: (val: string) => void;
  handleSaveSettings: (e: React.FormEvent) => void;
  csvFileName: string;
  csvFileText: string;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualSyncSubmit: (e: React.FormEvent) => void;
  manualSyncStatus: { type: 'success' | 'error'; msg: string } | null;
  actionLoading: string | null;
  handleClearAllProcurementData: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  showSettingsModal,
  setShowSettingsModal,
  tempSheetUrl,
  setTempSheetUrl,
  tempScriptUrl,
  setTempScriptUrl,
  tempOdooPassword,
  setTempOdooPassword,
  tempOdooDb,
  setTempOdooDb,
  tempOdooUid,
  setTempOdooUid,
  tempOdooSessionId,
  setTempOdooSessionId,
  handleSaveSettings,
  csvFileName,
  csvFileText,
  handleFileChange,
  handleManualSyncSubmit,
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
          maxWidth: 680,
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
            ⚙️ Pengaturan Integrasi Google Sheets, CSV & Odoo Cloud
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
          <form onSubmit={handleSaveSettings} style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--pur)', marginBottom: 12 }}>
              1. KONEKSI SINKRONISASI OTOMATIS GOOGLE SHEETS
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Link Google Sheets SCM (Publik / Web Export)
              </label>
              <input
                type="url"
                className="form-input"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={tempSheetUrl}
                onChange={(e) => setTempSheetUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Google Apps Script Webhook URL (Auto-Push PR)
              </label>
              <input
                type="url"
                className="form-input"
                placeholder="https://script.google.com/macros/s/..."
                value={tempScriptUrl}
                onChange={(e) => setTempScriptUrl(e.target.value)}
              />
            </div>

            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--pur)', margin: '20px 0 12px 0' }}>
              2. KREDENSIAL ODOO CLOUD (RPC / SESSION COOKIE)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  UID Pengguna Odoo
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={tempOdooUid}
                  onChange={(e) => setTempOdooUid(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Cookie Session ID (Odoo Browser Session)
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Tempelkan session_id dari Cookie Browser Odoo..."
                value={tempOdooSessionId}
                onChange={(e) => setTempOdooSessionId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Password / API Key Odoo
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Password akun Odoo..."
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
                style={{ fontWeight: 800, padding: '0 20px', height: 36, cursor: 'pointer' }}
              >
                💾 Simpan Pengaturan Connection
              </button>
            </div>
          </form>

          <div style={{ borderTop: '1px dashed var(--br)', margin: '20px 0' }} />

          <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--pur)', marginBottom: 12 }}>
            3. UNGGAH FILE CSV MANUAL & RESET DATA
          </div>

          <form onSubmit={handleManualSyncSubmit} style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Pilih Berkas CSV dari Komputer
              </label>
              <input
                type="file"
                accept=".csv"
                className="form-input"
                onChange={handleFileChange}
                style={{ padding: '6px 12px' }}
              />
              {csvFileName && (
                <div style={{ fontSize: 10, color: 'var(--grn)', marginTop: 4 }}>
                  ✓ File terpilih: {csvFileName}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!csvFileText || actionLoading === 'manual-sync'}
              className="btn btn-grn"
              style={{ fontWeight: 800, padding: '0 20px', height: 36, cursor: 'pointer', width: '100%' }}
            >
              {actionLoading === 'manual-sync' ? 'Memproses CSV...' : '📥 Impor & Sync File CSV Manual'}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClearAllProcurementData}
              disabled={actionLoading === 'clear-all'}
              style={{
                color: 'var(--red)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 10,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              🗑️ Menghapus Semua Data Pengadaan (Clean Reset)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
