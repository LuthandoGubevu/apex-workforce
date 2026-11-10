import { useEffect, useState } from 'react';
import { getDocs, query, orderBy, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { AccessGroup, Site } from '@/types';
import Modal from '@/components/Modal';

export default function AccessGroups() {
  const { staffUser } = useAuth();
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [sites, setSites]   = useState<Site[]>([]);
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState<AccessGroup | null>(null);
  const [form, setForm]     = useState({ name:'', siteId:'', description:'' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [gSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db, 'accessGroups'), orderBy('name'))),
      getDocs(query(collection(db, 'sites'), orderBy('name'))),
    ]);
    setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() }) as AccessGroup));
    setSites(sSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Site));
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm({ name:'', siteId: sites[0]?.id??'', description:'' }); setOpen(true); }
  function openEdit(g: AccessGroup) { setEditing(g); setForm({ name: g.name, siteId: g.siteId, description: g.description??'' }); setOpen(true); }

  async function save() {
    if (!staffUser) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const now = serverTimestamp();
      const uid = staffUser.id;
      if (editing) {
        batch.update(doc(db, 'accessGroups', editing.id), { ...form, updatedAt: now });
      } else {
        batch.set(doc(collection(db, 'accessGroups')), { ...form, createdAt: now, updatedAt: now, createdBy: uid });
      }
      batch.set(doc(collection(db, 'audit')), { timestamp: now, userId: uid, userEmail: staffUser.email, action: editing ? 'update' : 'create', collection: 'accessGroups', documentId: editing?.id??'new', after: form });
      await batch.commit();
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? id;
  const canEdit  = staffUser && ['admin','hr'].includes(staffUser.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Access Groups</h1>
        {canEdit && <button onClick={openAdd} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">Add Group</button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(g => (
          <div key={g.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{g.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{siteName(g.siteId)}</div>
              </div>
              {canEdit && <button onClick={() => openEdit(g)} className="text-brand-700 hover:text-brand-800 text-xs font-medium">Edit</button>}
            </div>
            {g.description && <p className="text-sm text-gray-500 mt-2">{g.description}</p>}
          </div>
        ))}
        {groups.length === 0 && <div className="col-span-full py-16 text-center text-gray-400 text-sm">No access groups yet</div>}
      </div>

      {open && (
        <Modal title={editing ? 'Edit Group' : 'Add Access Group'} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
              <select value={form.siteId} onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? 'Saving…' : editing ? 'Save' : 'Add Group'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
