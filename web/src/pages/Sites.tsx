import { useEffect, useState } from 'react';
import { getDocs, query, orderBy, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Site } from '@/types';
import Modal from '@/components/Modal';

export default function Sites() {
  const { staffUser } = useAuth();
  const [sites, setSites]     = useState<Site[]>([]);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm]       = useState({ name: '', code: '', city: '', address: '' });
  const [saving, setSaving]   = useState(false);

  async function load() {
    const snap = await getDocs(query(collection(db, 'sites'), orderBy('name')));
    setSites(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Site));
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm({ name:'', code:'', city:'', address:'' }); setOpen(true); }
  function openEdit(s: Site) { setEditing(s); setForm({ name: s.name, code: s.code, city: s.city??'', address: s.address??'' }); setOpen(true); }

  async function save() {
    if (!staffUser) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const now   = serverTimestamp();
      const uid   = staffUser.id;
      if (editing) {
        batch.update(doc(db, 'sites', editing.id), { ...form, updatedAt: now, updatedBy: uid });
      } else {
        batch.set(doc(collection(db, 'sites')), { ...form, createdAt: now, updatedAt: now, createdBy: uid });
      }
      batch.set(doc(collection(db, 'audit')), { timestamp: now, userId: uid, userEmail: staffUser.email, action: editing ? 'update' : 'create', collection: 'sites', documentId: editing?.id ?? 'new', after: form });
      await batch.commit();
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">Add Site</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{s.name}</div>
                <div className="text-xs font-mono text-gray-400 mt-0.5">{s.code}</div>
                {s.city && <div className="text-sm text-gray-500 mt-1">{s.city}</div>}
              </div>
              <button onClick={() => openEdit(s)} className="text-brand-700 hover:text-brand-800 text-xs font-medium">Edit</button>
            </div>
            {s.address && <div className="text-xs text-gray-400 mt-2">{s.address}</div>}
          </div>
        ))}
        {sites.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-400 text-sm">No sites yet</div>
        )}
      </div>

      {open && (
        <Modal title={editing ? 'Edit Site' : 'Add Site'} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {([['Name','name'],['Code (e.g. JNB)','code'],['City','city'],['Address','address']] as [string,string][]).map(([label, field]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  value={form[field as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600"
                />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Site'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
