import { useEffect, useState, useCallback } from 'react';
import { getDocs, query, where, collection, orderBy } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/firebase';
import type { Site, ClockEvent } from '@/types';

const TZ = 'Africa/Johannesburg';

interface OnSiteEmployee {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  siteId: string;
  siteName: string;
  clockedInAt: string;
}

export default function OnSiteNow() {
  const [sites,    setSites]    = useState<Site[]>([]);
  const [siteId,   setSiteId]   = useState('');
  const [onSite,   setOnSite]   = useState<OnSiteEmployee[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [lastRun,  setLastRun]  = useState<Date | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'sites'), orderBy('name')))
      .then(s => setSites(s.docs.map(d => ({ id: d.id, ...d.data() }) as Site)));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const todayStart = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd") + 'T00:00:00+02:00';

      const constraints: Parameters<typeof query>[1][] = [
        where('result', '==', 'accepted'),
        where('timestamp', '>=', todayStart),
        orderBy('timestamp', 'desc'),
      ];
      if (siteId) constraints.unshift(where('siteId', '==', siteId));

      const snap   = await getDocs(query(collection(db, 'clockEvents'), ...constraints));
      const events = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockEvent);

      // Last accepted event per employee
      const lastEvent = new Map<string, ClockEvent>();
      for (const e of events) {
        if (!lastEvent.has(e.employeeId)) lastEvent.set(e.employeeId, e);
      }

      const siteMap = new Map(sites.map(s => [s.id, s.name]));

      const result: OnSiteEmployee[] = [];
      for (const [, e] of lastEvent) {
        if (e.direction === 'IN') {
          result.push({
            employeeId:    e.employeeId,
            employeeName:  e.employeeName,
            employeeNumber: e.employeeNumber,
            siteId:        e.siteId,
            siteName:      siteMap.get(e.siteId) ?? e.siteId,
            clockedInAt:   e.timestamp,
          });
        }
      }

      result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      setOnSite(result);
      setLastRun(new Date());
    } finally { setLoading(false); }
  }, [siteId, sites]);

  useEffect(() => { if (sites.length > 0) refresh(); }, [sites]);

  const grouped = onSite.reduce((acc, e) => {
    if (!acc[e.siteName]) acc[e.siteName] = [];
    acc[e.siteName].push(e);
    return acc;
  }, {} as Record<string, OnSiteEmployee[]>);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">On Site Now</h1>
          {lastRun && <p className="text-gray-400 text-xs mt-0.5">Last updated {lastRun.toLocaleTimeString()}</p>}
        </div>
        <div className="flex items-center gap-3">
          <select value={siteId} onChange={e => setSiteId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none bg-white">
            <option value="">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={refresh} disabled={loading}
            className="px-4 py-2 bg-brand-800 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors">
            Print Roll-call
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-brand-50 rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="text-4xl font-bold text-brand-800">{onSite.length}</div>
        <div>
          <div className="font-semibold text-brand-800">People currently on site</div>
          <div className="text-sm text-brand-600">{formatInTimeZone(new Date(), TZ, "EEEE, d MMMM yyyy 'at' HH:mm")}</div>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-gray-400 text-sm">
          No one is currently on site
        </div>
      ) : (
        Object.entries(grouped).map(([siteName, employees]) => (
          <div key={siteName} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{siteName}</h2>
              <span className="text-sm text-gray-500">{employees.length} on site</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-50">
                {['Emp #','Name','Clocked In'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(e => (
                  <tr key={e.employeeId} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{e.employeeNumber}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{e.employeeName}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">
                      {formatInTimeZone(new Date(e.clockedInAt), TZ, 'HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
