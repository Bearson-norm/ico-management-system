import React from 'react';
import { TrackingItem } from '@/types/mtc/procurement';

type OdooProcessedModalProps = {
  showOdooProcessedModal: boolean;
  setShowOdooProcessedModal: (val: boolean) => void;
  odooProcessedItem: TrackingItem | null;
  odooProcessedPrNo: string;
  setOdooProcessedPrNo: (val: string) => void;
  odooProcessedStatus: 'DRAFT' | 'TO_APPROVE';
  setOdooProcessedStatus: (val: 'DRAFT' | 'TO_APPROVE') => void;
  handleOdooProcessedSubmit: (e: React.FormEvent) => void;
  actionLoading: string | null;
};

export const OdooProcessedModal: React.FC<OdooProcessedModalProps> = ({
  showOdooProcessedModal,
  setShowOdooProcessedModal,
  odooProcessedItem,
  odooProcessedPrNo,
  setOdooProcessedPrNo,
  odooProcessedStatus,
  setOdooProcessedStatus,
  handleOdooProcessedSubmit,
  actionLoading,
}) => {
  if (!showOdooProcessedModal || !odooProcessedItem) return null;

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
          maxWidth: 500,
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
          <div className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--pur)', margin: 0 }}>
            🚀 Pencatatan Status PR Odoo Resmi
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowOdooProcessedModal(false)}
            style={{ fontSize: 16, cursor: 'pointer' }}
          >
            ✖
          </button>
        </div>

        <form onSubmit={handleOdooProcessedSubmit} style={{ padding: 20 }}>
          <div
            style={{
              padding: 12,
              background: 'var(--sf3)',
              borderRadius: 8,
              marginBottom: 16,
              border: '1px solid var(--br)',
              fontSize: 11,
            }}
          >
            <div style={{ color: 'var(--tx3)' }}>Barang:</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--tx)', marginTop: 2 }}>
              {odooProcessedItem.originalName}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
              Nomor PR Resmi Odoo (Contoh: PR04566) <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="PR0..."
              value={odooProcessedPrNo}
              onChange={(e) => setOdooProcessedPrNo(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
              Status Pengajuan Odoo
            </label>
            <select
              className="form-input form-select"
              value={odooProcessedStatus}
              onChange={(e) => setOdooProcessedStatus(e.target.value as any)}
            >
              <option value="DRAFT">DRAFT (Draft PR Odoo)</option>
              <option value="TO_APPROVE">TO_APPROVE (Tunggu Persetujuan Manager)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowOdooProcessedModal(false)}>
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-pur"
              disabled={actionLoading !== null}
              style={{ fontWeight: 800, padding: '0 20px', height: 36, cursor: 'pointer' }}
            >
              🚀 Simpan Status PR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
