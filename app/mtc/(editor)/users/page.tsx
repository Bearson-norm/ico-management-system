'use client';
import { useState, useEffect } from 'react';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ id: '', username: '', namaLengkap: '', role: 'viewer', password: '' });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const res = await fetch('/api/mtc/users');
    const json = await res.json();
    if (json.success) setUsers(json.data);
    setLoading(false);
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    const isEdit = !!form.id;
    const res = await fetch('/api/mtc/users', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? {
        id: form.id, 
        namaLengkap: form.namaLengkap, 
        role: form.role,
        ...(form.password ? { newPassword: form.password } : {})
      } : form)
    });
    
    if (res.ok) {
      setModalOpen(false);
      fetchUsers();
    } else {
      const json = await res.json();
      alert('Error: ' + json.error);
    }
  }

  async function toggleStatus(id: string, current: boolean) {
    if (!confirm(`Yakin ingin ${current ? 'menonaktifkan' : 'mengaktifkan'} user ini?`)) return;
    const res = await fetch('/api/mtc/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, aktif: !current })
    });
    if (res.ok) fetchUsers();
    else {
      const json = await res.json();
      alert('Error: ' + json.error);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Manage Users</div>
            <div className="page-sub">Kelola akses sistem (Viewer/Editor)</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ id: '', username: '', namaLengkap: '', role: 'viewer', password: '' }); setModalOpen(true); }}>
            + Tambah User
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Nama Lengkap</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading ? 0.5 : 1 }}>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td>{u.namaLengkap}</td>
                  <td>
                    {u.role === 'editor' ? <span className="badge badge-pur">Editor</span> : <span className="badge badge-blu">Viewer</span>}
                  </td>
                  <td>
                    {u.aktif ? <span className="badge badge-grn">Aktif</span> : <span className="badge badge-red">Nonaktif</span>}
                  </td>
                  <td className="text-muted text-tiny">{new Date(u.createdAt).toLocaleDateString('id-ID')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ ...u, password: '' }); setModalOpen(true); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(u.id, u.aktif)}>{u.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal User */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">{form.id ? 'Edit User' : 'Tambah User'}</div>
            </div>
            <div className="modal-body">
              <form id="userForm" onSubmit={handleSubmit} className="form-grid">
                {!form.id && (
                  <div className="form-group">
                    <label className="form-label">Username <span className="req">*</span></label>
                    <input className="form-input" required value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Nama Lengkap <span className="req">*</span></label>
                  <input className="form-input" required value={form.namaLengkap} onChange={e => setForm({...form, namaLengkap: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role <span className="req">*</span></label>
                  <select className="form-input form-select" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                    <option value="viewer">Viewer (Stock Only)</option>
                    <option value="editor">Editor (Admin/Full Access)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Password {form.id ? '(Kosongkan jika tidak diubah)' : <span className="req">*</span>}</label>
                  <input className="form-input" type="password" required={!form.id} minLength={6} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Batal</button>
              <button type="submit" form="userForm" className="btn btn-primary">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
