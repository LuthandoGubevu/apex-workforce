import { useEffect, useState } from 'react';
import { query, where, getDocs, collection, orderBy, limit } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/firebase';
import type { ClockEvent } from '@/types';
import Badge from '@/components/Badge';

const TZ = 'Africa/Johannesburg';

export default function Dashboard() {
  const [activeCount,  setActiveCount]  = useState<number | null>(null);
  const [deniedToday,  setDeniedToday]  = useState<number | null>(null);
  const [recentEvents, setRecentEvents] = useState<ClockEvent[]>([]);

  useEffect(() => {
    async function load() {
      const empSnap = await getDocs(
        query(collection(db, 'employees'), where('status', '==', 'active'))
      );
      setActiveCount(empSnap.size);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const deniedSnap = await getDocs(
        query(collection(db, 'clockEvents'), where('result', '==', 'denied'), where('createdAt', '>=', startOfDay.toISOString()))
      );
      setDeniedToday(deniedSnap.size);

      const eventSnap = await getDocs(
        query(collection(db, 'clockEvents'), orderBy('timestamp', 'desc'), limit(15))
      );
      setRecentEvents(eventSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ClockEvent));
    }
    load();
  }, []);

  const today = formatInTimeZone(new Date(), TZ, 'EEEE, d MMMM yyyy');

  const statCards = [
    { label: 'Active Employees',  value: activeCount,  color: 'bg-brand-50  text-brand-800' },
    { label: 'Denied Today',      value: deniedToday,  color: 'bg-red-50    text-red-700'   },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-0.5">{today}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
        {statCards.map(c => (
          <div key={c.label} className={`rounded-2xl p-5 ${c.color}`}>
            <div className="text-3xl font-bold">{c.value ?? '—'}</div>
            <div className="text-sm mt-1 opacity-75 font-medium">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Clock Events</h2>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">No events yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentEvents.map(e => (
              <div key={e.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">{e.employeeName || e.employeeNumber}</span>
                  <span className="text-xs text-gray-400 ml-2">{e.stationName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge label={e.direction} variant={e.direction === 'IN' ? 'green' : 'gray'} />
                  <Badge label={e.result}    variant={e.result    === 'accepted' ? 'brand' : 'red'} />
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {formatInTimeZone(new Date(e.timestamp), TZ, 'HH:mm')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
