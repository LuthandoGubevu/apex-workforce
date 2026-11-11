import { useEffect, useState } from 'react';
import { getDocs, query, orderBy, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { ClockingStation, StationDirection, Site } from '@/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';

export default function Stations() {
  const { staffUser } = useAuth();
  const [stations, setStations] = useState<ClockingStation[]>([]);
  const [sites, setSites]       = useState<Site[]>([]);
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<ClockingStation | null>(null);
  const [form, setForm]         = useState({ name:'', siteId:'', direction:'BOTH' as StationDirection });
  const [saving, setSaving]     = useState(false);

  async function load() {
    const [stSnap, siteSnap] = await Promise.all([
      getDocs(query(collection(db, 'stations'), orderBy('name'))),
      getDocs(query(collection(db, 'sites'), orderBy('name'))),
    ]);
    setStations(stSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockingStation));
    setSites(siteSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Site));
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm({ name:'', siteId: sites[0]?.id ?? '', direction: 'BOTH' }); setOpen(true); }
  function openEdit(st: ClockingStation) { setEditing(st); setForm({ name: st.name, siteId: st.siteId, direction: st.direction }); setOpen(true); }

  async function save() {
    if (!staffUser) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const now   = serverTimestamp();
      const uid   = staffUser.id;
      if (editing) {
        batch.update(doc(db, 'stations', editing.id), { ...form, updatedAt: now });
      } else {
        batch.set(doc(collection(db, 'stations')), { ...form, accessGroupIds: [], createdAt: now, updatedAt: now, createdBy: uid });
      }
      batch.set(doc(collection(db, 'audit')), { timestamp: now, userId: uid, userEmail: staffUser.email, action: editing ? 'update' : 'create', collection: 'stations', documentId: editing?.id ?? 'new', after: form });
      await batch.commit();
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? id;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Clocking Stations</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">Add Station</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {stations.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No stations yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['Name','Site','Direction','Device',''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {stations.map(st => (
                <tr key={st.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{st.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{siteName(st.siteId)}</td>
                  <td className="px-5 py-3.5"><Badge label={st.direction} variant="brand" /></td>
                  <td className="px-5 py-3.5">
                    <Badge label={st.deviceId ? 'Connected' : 'Not registered'} variant={st.deviceId ? 'green' : 'gray'} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => openEdit(st)} className="text-brand-700 hover:text-brand-800 text-xs font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal title={editing ? 'Edit Station' : 'Add Station'} onClose={() => setOpen(false)}>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as StationDirection }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
                <option value="BOTH">BOTH (alternates by last event)</option>
                <option value="IN">IN only</option>
                <option value="OUT">OUT only</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? 'Saving…' : editing ? 'Save' : 'Add Station'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
