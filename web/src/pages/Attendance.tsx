import { useEffect, useState } from 'react';
import { getDocs, query, where, collection, orderBy, limit } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import { subDays } from 'date-fns';
import { db } from '@/firebase';
import type { Site, Employee, ClockEvent } from '@/types';
import { buildDailyRecords, fmtDuration, fmtTime, type DailyRecord, type AttEvent } from '@/lib/attendance';
import { exportAttendanceCsv, exportPayrollCsv, exportAttendanceExcel } from '@/lib/exports';
import Badge from '@/components/Badge';

const TZ = 'Africa/Johannesburg';

export default function Attendance() {
  const today   = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const weekAgo = formatInTimeZone(subDays(new Date(), 6), TZ, 'yyyy-MM-dd');

  const [sites,     setSites]     = useState<Site[]>([]);
  const [siteId,    setSiteId]    = useState('');
  const [dept,      setDept]      = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [dateFrom,  setDateFrom]  = useState(weekAgo);
  const [dateTo,    setDateTo]    = useState(today);
  const [records,   setRecords]   = useState<DailyRecord[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [ran,       setRan]       = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, 'sites'), orderBy('name')))
      .then(s => setSites(s.docs.map(d => ({ id: d.id, ...d.data() }) as Site)));
  }, []);

  async function run() {
    setLoading(true); setRan(true);
    try {
      // Fetch employees to enrich department
      const empConstraints = siteId ? [where('siteId', '==', siteId)] : [];
      const empSnap = await getDocs(query(collection(db, 'employees'), ...empConstraints));
      const empMap = new Map<string, Employee>();
      empSnap.docs.forEach(d => { const e = { id: d.id, ...d.data() } as Employee; empMap.set(e.id, e); });

      // Fetch clock events
      const evtConstraints: Parameters<typeof query>[1][] = [orderBy('timestamp', 'desc'), limit(10000)];
      if (siteId) evtConstraints.unshift(where('siteId', '==', siteId));
      const evtSnap = await getDocs(query(collection(db, 'clockEvents'), ...evtConstraints));
      const events  = evtSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockEvent);

      const attEvents: AttEvent[] = events.map(e => ({
        id: e.id, employeeId: e.employeeId, employeeName: e.employeeName,
        employeeNumber: e.employeeNumber,
        department: empMap.get(e.employeeId)?.department ?? '',
        siteId: e.siteId, direction: e.direction, timestamp: e.timestamp,
        result: e.result, isCorrection: e.isCorrection,
      }));

      let recs = buildDailyRecords(attEvents, dateFrom, dateTo);
      if (dept)      recs = recs.filter(r => r.department.toLowerCase().includes(dept.toLowerCase()));
      if (empSearch) recs = recs.filter(r =>
        r.employeeName.toLowerCase().includes(empSearch.toLowerCase()) ||
        r.employeeNumber.toLowerCase().includes(empSearch.toLowerCase())
      );
      setRecords(recs);
    } finally { setLoading(false); }
  }

  const totalMins    = records.reduce((s, r) => s + r.minutesOnSite, 0);
  const missingCount = records.filter(r => r.missingClockOut || r.missingClockIn).length;

  const btnCls = 'px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
        {records.length > 0 && (
          <div className="flex gap-2">
            <button className={btnCls} onClick={() => exportAttendanceCsv(records)}>CSV</button>
            <button className={btnCls} onClick={() => exportPayrollCsv(records)}>Payroll CSV</button>
            <button className={btnCls} onClick={() => exportAttendanceExcel(records)}>Excel</button>
            <button className={btnCls} onClick={() => window.print()}>Print / PDF</button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none bg-white">
              <option value="">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
            <input placeholder="All" value={dept} onChange={e => setDept(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Employee</label>
            <input placeholder="Name or number" value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-600" />
          </div>
          <div className="flex items-end">
            <button onClick={run} disabled={loading}
              className="w-full py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? 'Loading…' : 'Run Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {ran && !loading && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-brand-50 rounded-2xl p-4">
            <div className="text-2xl font-bold text-brand-800">{records.length}</div>
            <div className="text-sm text-brand-600 mt-0.5">Records</div>
          </div>
          <div className="bg-green-50 rounded-2xl p-4">
            <div className="text-2xl font-bold text-green-700">{fmtDuration(totalMins)}</div>
            <div className="text-sm text-green-600 mt-0.5">Total hours on site</div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4">
            <div className="text-2xl font-bold text-amber-700">{missingCount}</div>
            <div className="text-sm text-amber-600 mt-0.5">Missing clock events</div>
          </div>
        </div>
      )}

      {/* Table */}
      {ran && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:border-0">
          {records.length === 0 && !loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">No records for the selected filters</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date','Emp #','Name','Department','First IN','Last OUT','Hours','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r, i) => (
                  <tr key={i} className={`hover:bg-gray-50/50 ${
                    r.missingClockOut || r.missingClockIn ? 'bg-amber-50/40' : ''
                  }`}>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.date}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.employeeNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.employeeName}</td>
                    <td className="px-4 py-3 text-gray-600">{r.department}</td>
                    <td className="px-4 py-3 font-mono text-xs">{fmtTime(r.firstIn)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{fmtTime(r.lastOut)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-medium">{fmtDuration(r.minutesOnSite)}</td>
                    <td className="px-4 py-3">
                      {r.missingClockOut ? <Badge label="Missing clock-out" variant="amber" /> :
                       r.missingClockIn  ? <Badge label="Missing clock-in"  variant="amber" /> :
                       <Badge label="OK" variant="green" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <style>{`@media print { body > * { display: none; } body > #root { display: block; } }`}</style>
    </div>
  );
}
