import React from 'react';
import { TrackingItem } from '@/types/mtc/procurement';

type EditScmModalProps = {
  showEditModal: boolean;
  setShowEditModal: (val: boolean) => void;
  editingItem: TrackingItem | null;
  editPrNo: string;
  setEditPrNo: (val: string) => void;
  editPoNo: string;
  setEditPoNo: (val: string) => void;
  editTeNo: string;
  setEditTeNo: (val: string) => void;
  editStatusPr: string;
  setEditStatusPr: (val: string) => void;
  editVendor: string;
  setEditVendor: (val: string) => void;
  editPrice: number;
  setEditPrice: (val: number) => void;
  editQty: number;
  setEditQty: (val: number) => void;
  editEta: string;
  setEditEta: (val: string) => void;
  editGrLink: string;
  setEditGrLink: (val: string) => void;
  editReason: string;
  setEditReason: (val: string) => void;
  editCategory: string;
  setEditCategory: (val: string) => void;
  editKeterangan: string;
  setEditKeterangan: (val: string) => void;
  editUrgency: string;
  setEditUrgency: (val: string) => void;
  handleEditSubmit: (e: React.FormEvent) => void;
  actionLoading: string | null;
};

export const EditScmModal: React.FC<EditScmModalProps> = ({
  showEditModal,
  setShowEditModal,
  editingItem,
  editPrNo,
  setEditPrNo,
  editPoNo,
  setEditPoNo,
  editTeNo,
  setEditTeNo,
  editStatusPr,
  setEditStatusPr,
  editVendor,
  setEditVendor,
  editPrice,
  setEditPrice,
  editQty,
  setEditQty,
  editEta,
  setEditEta,
  editGrLink,
  setEditGrLink,
  editReason,
  setEditReason,
  editCategory,
  setEditCategory,
  editKeterangan,
  setEditKeterangan,
  editUrgency,
  setEditUrgency,
  handleEditSubmit,
  actionLoading,
}) => {
  if (!showEditModal || !editingItem) return null;

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
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--sf2)',
          border: '1px solid var(--blu)',
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
          <div className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--blu)', margin: 0 }}>
            ✏️ Edit Detail SCM / PR / PO
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowEditModal(false)}
            style={{ fontSize: 16, cursor: 'pointer' }}
          >
            ✖
          </button>
        </div>

        <form onSubmit={handleEditSubmit} style={{ padding: 20 }}>
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
              {editingItem.originalName}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Nomor PR
              </label>
              <input
                type="text"
                className="form-input"
                value={editPrNo}
                onChange={(e) => setEditPrNo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Nomor PO
              </label>
              <input
                type="text"
                className="form-input"
                value={editPoNo}
                onChange={(e) => setEditPoNo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Nomor TE
              </label>
              <input
                type="text"
                className="form-input"
                value={editTeNo}
                onChange={(e) => setEditTeNo(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Status PR Odoo
              </label>
              <select
                className="form-input form-select"
                value={editStatusPr}
                onChange={(e) => setEditStatusPr(e.target.value)}
              >
                <option value="DRAFT">DRAFT (Draft PR)</option>
                <option value="WAITING_PRICE">WAITING_PRICE (Menunggu Harga)</option>
                <option value="READY_ODOO">READY_ODOO (Siap ke Odoo)</option>
                <option value="TO_APPROVE">TO_APPROVE (Tunggu Approve)</option>
                <option value="APPROVED">APPROVED (Disetujui PR)</option>
                <option value="PO">PO (Sudah Terbit PO)</option>
                <option value="RECEIVED">RECEIVED (Diterima/Selesai)</option>
                <option value="CANCELLED">CANCELLED (Dibatalkan)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Vendor
              </label>
              <input
                type="text"
                className="form-input"
                value={editVendor}
                onChange={(e) => setEditVendor(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Harga Satuan (Rp)
              </label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={editPrice}
                onChange={(e) => setEditPrice(Number(e.target.value) || 0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Qty
              </label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={editQty}
                onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                Estimasi Tiba (ETA)
              </label>
              <input
                type="date"
                className="form-input"
                value={editEta}
                onChange={(e) => setEditEta(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
              Link GR Odoo (good.received URL)
            </label>
            <input
              type="url"
              className="form-input"
              placeholder="https://foomx.odoo.com/web#id=...&model=good.received"
              value={editGrLink}
              onChange={(e) => setEditGrLink(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-blu"
              disabled={actionLoading !== null}
              style={{ fontWeight: 800, padding: '0 20px', height: 36, cursor: 'pointer' }}
            >
              💾 Perbarui Detail SCM
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
