import { useEffect, useState } from 'react';
import { getDocs, query, orderBy, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Employee, EmployeeStatus, EmploymentType } from '@/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';

const statusVariant = (s: EmployeeStatus) =>
  s === 'active' ? 'green' : s === 'suspended' ? 'amber' : 'red';

const typeLabel: Record<EmploymentType, string> = {
  permanent:   'Permanent',
  contractor:  'Contractor',
  temporary:   'Temporary',
};

const EMPTY: Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
  employeeNumber: '', fullName: '', department: '', siteId: '',
  jobTitle: '', employmentType: 'permanent', status: 'active',
  startDate: '', endDate: '', fingerprintEnrolled: false,
  biometricDeclined: false, notes: '',
};

export default function Employees() {
  const { staffUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);

  async function load() {
    const snap = await getDocs(query(collection(db, 'employees'), orderBy('fullName')));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Employee));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      employeeNumber: emp.employeeNumber, fullName: emp.fullName,
      department:     emp.department,     siteId:   emp.siteId,
      jobTitle:       emp.jobTitle  ?? '', employmentType: emp.employmentType,
      status:         emp.status,         startDate: emp.startDate,
      endDate:        emp.endDate ?? '',   fingerprintEnrolled: emp.fingerprintEnrolled,
      biometricDeclined: emp.biometricDeclined, notes: emp.notes ?? '',
    });
    setModalOpen(true);
  }

  async function save() {
    if (!staffUser) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const now   = serverTimestamp();
      const uid   = staffUser.id;
      const payload = {
        ...form,
        updatedAt: now,
        updatedBy: uid,
      };
      if (editing) {
        batch.update(doc(db, 'employees', editing.id), payload);
      } else {
        const newRef = doc(collection(db, 'employees'));
        batch.set(newRef, { ...payload, createdAt: now, createdBy: uid });
      }
      // audit
      batch.set(doc(collection(db, 'audit')), {
        timestamp: now, userId: uid, userEmail: staffUser.email,
        action: editing ? 'update' : 'create',
        collection: 'employees',
        documentId: editing?.id ?? 'new',
        after: payload,
      });
      await batch.commit();
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const visible = employees.filter(e => {
    const matchSearch = !search ||
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const canEdit = staffUser && ['admin','hr'].includes(staffUser.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
          <p className="text-gray-400 text-sm mt-0.5">{employees.length} total</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="px-4 py-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors">
            Add Employee
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-5">
        <input
          type="search" placeholder="Search name, number, department…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 bg-white"
        />
        <select
          value={filterStatus} onChange={e => setFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No employees found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Emp #','Name','Department','Type','Status','Fingerprint',''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{e.employeeNumber}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-900">{e.fullName}</td>
                  <td className="px-5 py-3.5 text-gray-600">{e.department}</td>
                  <td className="px-5 py-3.5">
                    <Badge label={typeLabel[e.employmentType]} variant="gray" />
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge label={e.status} variant={statusVariant(e.status)} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge
                      label={e.fingerprintEnrolled ? 'Enrolled' : e.biometricDeclined ? 'Declined' : 'Pending'}
                      variant={e.fingerprintEnrolled ? 'brand' : e.biometricDeclined ? 'red' : 'gray'}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canEdit && (
                      <button onClick={() => openEdit(e)} className="text-brand-700 hover:text-brand-800 text-xs font-medium">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Edit Employee' : 'Add Employee'} onClose={() => setModalOpen(false)}>
          <div className="space-y-4">
            {([
              ['Employee Number', 'employeeNumber', 'text'],
              ['Full Name',       'fullName',       'text'],
              ['Department',      'department',     'text'],
              ['Site ID',         'siteId',         'text'],
              ['Job Title',       'jobTitle',       'text'],
              ['Start Date',      'startDate',      'date'],
              ['End Date (contractors/temp)', 'endDate', 'date'],
            ] as [string, keyof typeof form, string][]).map(([label, field, type]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={String(form[field])}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600"
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={e => setForm(f => ({ ...f, employmentType: e.target.value as EmploymentType }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none"
              >
                <option value="permanent">Permanent</option>
                <option value="contractor">Contractor</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>

            {editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as EmployeeStatus }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="declined" checked={form.biometricDeclined}
                onChange={e => setForm(f => ({ ...f, biometricDeclined: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="declined" className="text-sm text-gray-700">Biometric declined (POPIA)</label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={save} disabled={saving}
                className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
