import { useEffect, useState } from 'react';
import { getDocs, query, where, collection, orderBy, limit, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { ClockEvent, Employee, Site, ClockDirection } from '@/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';

const TZ = 'Africa/Johannesburg';

export default function Corrections() {
  const { staffUser } = useAuth();
  const [corrections, setCorrections] = useState<ClockEvent[]>([]);
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [sites,       setSites]       = useState<Site[]>([]);
  const [open,        setOpen]        = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [form, setForm] = useState({
    employeeId: '', direction: 'IN' as ClockDirection,
    date: formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd'),
    time: '08:00', reason: '',
  });

  async function load() {
    const [corrSnap, empSnap, siteSnap] = await Promise.all([
      getDocs(query(collection(db, 'clockEvents'), where('isCorrection', '==', true), orderBy('timestamp', 'desc'), limit(100))),
      getDocs(query(collection(db, 'employees'), where('status', '==', 'active'), orderBy('fullName'))),
      getDocs(query(collection(db, 'sites'), orderBy('name'))),
    ]);
    setCorrections(corrSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockEvent));
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Employee));
    setSites(siteSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Site));
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!staffUser || !form.employeeId || !form.reason) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === form.employeeId);
      if (!emp) return;

      const isoTs = `${form.date}T${form.time}:00+02:00`;
      const batch = writeBatch(db);
      const now   = serverTimestamp();
      const uid   = staffUser.id;

      const eventRef = doc(collection(db, 'clockEvents'));
      batch.set(eventRef, {
        employeeId:    emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName:  emp.fullName,
        stationId:     'correction',
        stationName:   'HR Correction',
        siteId:        emp.siteId,
        direction:     form.direction,
        result:        'accepted',
        timestamp:     isoTs,
        isCorrection:  true,
        correctionReason: form.reason,
        correctedBy:   uid,
        createdAt:     now,
      });

      batch.set(doc(collection(db, 'audit')), {
        timestamp: now, userId: uid, userEmail: staffUser.email,
        action: 'correction',
        collection: 'clockEvents',
        documentId: eventRef.id,
        after: { employeeId: emp.id, direction: form.direction, timestamp: isoTs, reason: form.reason },
        note: `HR correction: ${form.direction} for ${emp.fullName} on ${form.date} at ${form.time}`,
      });

      await batch.commit();
      setOpen(false);
      load();
    } finally { setSaving(false); }
  }

  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? id;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">HR Corrections</h1>
          <p className="text-gray-400 text-sm mt-0.5">Add a missing clock-in or clock-out for an employee</p>
        </div>
        <button onClick={() => setOpen(true)}
            className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">
            Add Correction
          </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-6">
        Corrections are stored as separate entries and never modify the original clock event. Every correction is audited.
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {corrections.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No corrections on record</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['Time (corrected)','Employee','Site','Direction','Reason','Added by'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {corrections.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatInTimeZone(new Date(c.timestamp), TZ, 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.employeeName}</div>
                    <div className="text-xs text-gray-400">{c.employeeNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{siteName(c.siteId)}</td>
                  <td className="px-4 py-3">
                    <Badge label={c.direction} variant={c.direction === 'IN' ? 'green' : 'gray'} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{c.correctionReason}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{c.correctedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal title="Add HR Correction" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600">
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeNumber})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time (SA)</label>
                <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
              <div className="flex gap-3">
                {(['IN','OUT'] as ClockDirection[]).map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={d} checked={form.direction === d}
                      onChange={() => setForm(f => ({ ...f, direction: d }))}
                      className="accent-brand-800" />
                    <span className="text-sm">{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Employee forgot to clock out on 15 Jun — confirmed by supervisor"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 resize-none" />
            </div>
            <div className="bg-amber-50 text-amber-800 text-xs rounded-lg px-3 py-2">
              This correction is stored as a new clock event with isCorrection = true. The original record is not changed.
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={save} disabled={saving || !form.employeeId || !form.reason}
                className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Save Correction'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
