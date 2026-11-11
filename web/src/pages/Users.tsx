import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { StaffUser, UserRole, Site } from '@/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';

type RoleVariant = 'brand' | 'amber' | 'gray';
const roleVariant = (r: UserRole): RoleVariant =>
  r === 'admin' ? 'brand' : r === 'hr' ? 'amber' : 'gray';

const EMPTY = { fullName: '', email: '', role: 'hr' as UserRole, siteId: '', active: true };

export default function Users() {
  const { staffUser } = useAuth();
  const navigate       = useNavigate();

  const [users,     setUsers]     = useState<StaffUser[]>([]);
  const [sites,     setSites]     = useState<Site[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<StaffUser | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');
  const [toast,     setToast]     = useState('');


  async function load() {
    const [userSnap, siteSnap] = await Promise.all([
      getDocs(collection(db, 'staffUsers')),
      getDocs(collection(db, 'sites')),
    ]);
    setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() }) as StaffUser));
    setSites(siteSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Site));
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function openInvite() {
    setEditing(null);
    setForm({ ...EMPTY });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(u: StaffUser) {
    setEditing(u);
    setForm({ fullName: u.fullName, email: u.email, role: u.role, siteId: u.siteId ?? '', active: u.active });
    setFormError('');
    setModalOpen(true);
  }

  function validate(): string {
    if (!form.fullName.trim()) return 'Full name is required.';
    if (!form.email.trim())    return 'Email is required.';
    if (!['admin', 'hr'].includes(form.role)) return 'Invalid role.';
    return '';
  }

  async function save() {
    if (!staffUser) return;
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'staffUsers', editing.id), {
          fullName:  form.fullName.trim(),
          role:      form.role,
          siteId:    form.siteId,
          active:    form.active,
          updatedAt: serverTimestamp(),
          updatedBy: staffUser.id,
        });
        showToast('User updated.');
      } else {
        const fn = httpsCallable<{ email: string; fullName: string; role: string; siteId: string }, { uid: string }>(
          functions, 'createStaffUser'
        );
        await fn({ email: form.email.trim(), fullName: form.fullName.trim(), role: form.role, siteId: form.siteId });
        await sendPasswordResetEmail(auth, form.email.trim());
        showToast(`Invite sent to ${form.email.trim()}`);
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      setFormError((e as { message?: string }).message ?? 'An error occurred.');
    } finally {
      setSaving(false);
    }
  }

  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Staff Users</h1>
          <p className="text-gray-400 text-sm mt-0.5">{users.length} total</p>
        </div>
        <button onClick={openInvite} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">
          Invite User
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No staff users found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Email', 'Role', 'Site', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{u.fullName}</td>
                  <td className="px-5 py-3.5 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge label={u.role} variant={roleVariant(u.role)} />
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{u.siteId ? siteName(u.siteId) : 'All sites'}</td>
                  <td className="px-5 py-3.5">
                    <Badge label={u.active ? 'Active' : 'Inactive'} variant={u.active ? 'green' : 'gray'} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => openEdit(u)} className="text-brand-700 hover:text-brand-800 text-xs font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Edit User' : 'Invite User'} onClose={() => setModalOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" value={form.email} disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 disabled:bg-gray-50 disabled:text-gray-400"
              />
              {!editing && <p className="text-xs text-gray-400 mt-1">A password-reset email will be sent so the user can set their password.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600"
              >
                <option value="admin">Admin — full access + manage staff users</option>
                <option value="hr">HR — full access to all features</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site scope</label>
              <select
                value={form.siteId}
                onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600"
              >
                <option value="">All sites (Admin)</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="active" className="text-sm text-gray-700">Active</label>
              </div>
            )}

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 px-3.5 py-2.5 rounded-xl">{formError}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={save} disabled={saving}
                className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Send Invite'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
