import { useEffect, useState } from 'react';
import { getDocs, query, orderBy, limit, collection } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/firebase';
import type { ClockEvent } from '@/types';
import Badge from '@/components/Badge';

const TZ = 'Africa/Johannesburg';

export default function ClockEvents() {
  const [events, setEvents] = useState<ClockEvent[]>([]);

  useEffect(() => {
    getDocs(query(collection(db, 'clockEvents'), orderBy('timestamp', 'desc'), limit(200)))
      .then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockEvent)));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Clock Events</h1>
        <p className="text-gray-400 text-sm mt-0.5">Most recent 200 events</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {events.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No events recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['Time','Employee','Station','Dir','Result','Reason'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {events.map(e => (
                <tr key={e.id} className={`hover:bg-gray-50/50 ${e.isCorrection ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                    {formatInTimeZone(new Date(e.timestamp), TZ, 'dd MMM HH:mm')}
                    {e.isCorrection && <span className="ml-1 text-amber-600 text-xs">✏️</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{e.employeeName}</div>
                    <div className="text-xs text-gray-400">{e.employeeNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{e.stationName}</td>
                  <td className="px-4 py-3"><Badge label={e.direction} variant={e.direction === 'IN' ? 'green' : 'gray'} /></td>
                  <td className="px-4 py-3"><Badge label={e.result}    variant={e.result === 'accepted' ? 'brand' : 'red'} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.deniedReason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
