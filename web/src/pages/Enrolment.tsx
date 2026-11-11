import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
  serverTimestamp, addDoc,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { writeWithAudit } from '@/lib/actions';
import type { Employee, ClockingStation, EnrolmentRequest, Site } from '@/types';

type RequestStatus = EnrolmentRequest['status'];

interface EnrichedRequest extends EnrolmentRequest {
  employeeName: string;
  employeeNumber: string;
  stationName: string;
  siteName: string;
  requestedByName: string;
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  failed:      'Failed',
  cancelled:   'Cancelled',
};

const STATUS_CLS: Record<RequestStatus, string> = {
  pending:     'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed:   'bg-green-100 text-green-800',
  failed:      'bg-red-100 text-red-800',
  cancelled:   'bg-gray-100 text-gray-700',
};

function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function Enrolment() {
  const { user, staffUser } = useAuth();
  const isHR = true;

  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [stations,  setStations]    = useState<ClockingStation[]>([]);
  const [sites,     setSites]       = useState<Site[]>([]);
  const [requests,  setRequests]    = useState<EnrichedRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');

  // modal state
  const [open,          setOpen]          = useState(false);
  const [empSearch,     setEmpSearch]     = useState('');
  const [selectedEmp,   setSelectedEmp]   = useState<Employee | null>(null);
  const [selectedStation, setSelectedStation] = useState('');
  const [consentGiven,  setConsentGiven]  = useState(false);
  const [consentDate,   setConsentDate]   = useState(
    new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  // ── load reference data ───────────────────────────────────────────────────
  useEffect(() =>
    onSnapshot(collection(db, 'employees'), snap =>
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)))
    )
  , []);

  useEffect(() =>
    onSnapshot(collection(db, 'stations'), snap =>
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClockingStation)))
    )
  , []);

  useEffect(() =>
    onSnapshot(collection(db, 'sites'), snap =>
      setSites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Site)))
    )
  , []);

  // ── load enrolment requests ───────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'enrolmentRequests'), orderBy('requestedAt', 'desc'));
    return onSnapshot(q, snap => {
      const empMap     = new Map(employees.map(e => [e.id, e]));
      const stationMap = new Map(stations.map(s => [s.id, s]));
      const siteMap    = new Map(sites.map(s => [s.id, s]));
      setRequests(
        snap.docs.map(d => {
          const r = { id: d.id, ...d.data() } as EnrolmentRequest;
          const emp     = empMap.get(r.employeeId);
          const station = stationMap.get(r.stationId);
          const site    = station ? siteMap.get(station.siteId) : undefined;
          return {
            ...r,
            employeeName:   emp?.fullName      ?? r.employeeId,
            employeeNumber: emp?.employeeNumber ?? '',
            stationName:    station?.name       ?? r.stationId,
            siteName:       site?.name          ?? '',
            requestedByName: r.requestedBy,
          };
        }),
      );
    });
  }, [employees, stations, sites]);

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  // ── employee search results ───────────────────────────────────────────────
  const empResults = empSearch.trim().length > 1
    ? employees.filter(e =>
        e.status === 'active' &&
        !e.biometricDeclined &&
        (e.fullName.toLowerCase().includes(empSearch.toLowerCase()) ||
         e.employeeNumber.includes(empSearch))
      ).slice(0, 8)
    : [];

  // ── cancel request ────────────────────────────────────────────────────────
  async function cancelRequest(r: EnrichedRequest) {
    if (!user || !staffUser) return;
    await writeWithAudit(
      batch => batch.update(doc(db, 'enrolmentRequests', r.id), {
        status: 'cancelled',
      }),
      {
        userId: user.uid, userEmail: user.email ?? '',
        action: 'cancel_enrolment_request',
        collection: 'enrolmentRequests', documentId: r.id,
        before: { status: r.status }, after: { status: 'cancelled' },
      },
    );
  }

  // ── submit new request ────────────────────────────────────────────────────
  async function submitRequest() {
    setErr('');
    if (!selectedEmp)       return setErr('Select an employee');
    if (!selectedStation)   return setErr('Select a station');
    if (!consentGiven)      return setErr('Biometric consent must be confirmed before enrolment');
    if (!consentDate)       return setErr('Enter the consent date');
    if (!user || !staffUser) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      await writeWithAudit(
        batch => {
          // record consent on employee
          batch.update(doc(db, 'employees', selectedEmp.id), {
            biometricConsent: {
              date:            consentDate,
              staffMemberId:   user.uid,
              staffMemberName: staffUser.fullName,
            },
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          // create enrolment request
          batch.set(doc(collection(db, 'enrolmentRequests')), {
            employeeId:  selectedEmp.id,
            stationId:   selectedStation,
            status:      'pending',
            requestedAt: now,
            requestedBy: user.uid,
          });
        },
        {
          userId: user.uid, userEmail: user.email ?? '',
          action: 'create_enrolment_request',
          collection: 'enrolmentRequests', documentId: 'new',
          after: {
            employeeId: selectedEmp.id, stationId: selectedStation,
            consentDate, consentRecordedBy: staffUser.fullName,
          },
        },
      );
      resetModal();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function resetModal() {
    setOpen(false);
    setEmpSearch(''); setSelectedEmp(null); setSelectedStation('');
    setConsentGiven(false); setConsentDate(new Date().toLocaleDateString('en-CA'));
    setErr('');
  }

  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Enrolment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage fingerprint enrolment requests and POPIA consent</p>
        </div>
        <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-800 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            New Request
          </button>
      </div>

      {/* POPIA notice */}
      <div className="flex gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5 text-amber-600">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
        <div>
          <span className="font-semibold">POPIA biometric data notice: </span>
          Fingerprint templates are encrypted at rest (AES-256-GCM) and in transit. Written consent must be
          obtained from the employee before enrolment begins. Templates are automatically deleted when an
          employee is terminated.
        </div>
      </div>

      {/* status filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'in_progress', 'completed', 'failed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-brand-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
            {' '}
            <span className="opacity-70">
              ({s === 'all' ? requests.length : requests.filter(r => r.status === s).length})
            </span>
          </button>
        ))}
      </div>

      {/* table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Station</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Requested</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Completed</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No enrolment requests
                </td>
              </tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{r.employeeName}</div>
                  <div className="text-xs text-gray-500">{r.employeeNumber}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">{r.stationName}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.siteName}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(r.requestedAt)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(r.completedAt)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.errorMessage && (
                    <div className="text-xs text-red-600 mt-0.5">{r.errorMessage}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                    {r.status === 'pending' && (
                      <button
                        onClick={() => cancelRequest(r)}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── New Request Modal ─────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Enrolment Request</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                The employee will be enrolled at the selected station on their next visit.
              </p>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

              {/* employee search */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Employee *</label>
                {selectedEmp ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-brand-50 border border-brand-200">
                    <div>
                      <div className="text-sm font-medium text-brand-900">{selectedEmp.fullName}</div>
                      <div className="text-xs text-brand-600">{selectedEmp.employeeNumber} · {selectedEmp.department}</div>
                    </div>
                    <button
                      onClick={() => { setSelectedEmp(null); setEmpSearch(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      placeholder="Search by name or employee number…"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                    {empResults.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {empResults.map(e => (
                          <li key={e.id}>
                            <button
                              onClick={() => { setSelectedEmp(e); setEmpSearch(''); }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm"
                            >
                              <span className="font-medium">{e.fullName}</span>
                              <span className="text-gray-500 ml-2 text-xs">{e.employeeNumber}</span>
                              {e.fingerprintEnrolled && (
                                <span className="ml-2 text-xs text-amber-600">(already enrolled)</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {selectedEmp?.fingerprintEnrolled && (
                  <p className="text-xs text-amber-700">
                    This employee already has a fingerprint on record. A new enrolment will overwrite it at the selected station.
                  </p>
                )}
              </div>

              {/* station */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Clocking Station *</label>
                <select
                  value={selectedStation}
                  onChange={e => setSelectedStation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select a station…</option>
                  {stations.map(s => {
                    const site = sites.find(si => si.id === s.siteId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name}{site ? ` — ${site.name}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* POPIA consent */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-800 font-medium">POPIA Biometric Consent Required</p>
                </div>
                <p className="text-xs text-amber-700">
                  Under the Protection of Personal Information Act (POPIA), written consent must be obtained
                  from the employee before collecting fingerprint biometric data. By checking the box below
                  you confirm this consent has been signed and filed.
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={e => setConsentGiven(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-600"
                  />
                  <span className="text-sm text-gray-800">
                    I confirm that <strong>{selectedEmp?.fullName ?? 'the selected employee'}</strong> has
                    provided written biometric consent and the signed consent form has been filed.
                  </span>
                </label>

                {consentGiven && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-gray-700">Consent date *</label>
                    <input
                      type="date"
                      value={consentDate}
                      max={new Date().toLocaleDateString('en-CA')}
                      onChange={e => setConsentDate(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                )}
              </div>

              {err && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={resetModal}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRequest}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand-800 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Create Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
