import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { to: '/',             end: true,  label: 'Dashboard',     icon: 'grid'     },
  { to: '/on-site-now',  end: false, label: 'On Site Now',   icon: 'users'    },
  { to: '/employees',    end: false, label: 'Employees',     icon: 'person'   },
  { to: '/attendance',   end: false, label: 'Attendance',    icon: 'calendar' },
  { to: '/clock-events', end: false, label: 'Clock Events',  icon: 'clock'    },
  { to: '/corrections',  end: false, label: 'Corrections',   icon: 'edit',    adminHr: true },
  { to: '/access-groups',end: false, label: 'Access Groups', icon: 'lock',    adminHr: true },
  { to: '/stations',     end: false, label: 'Stations',      icon: 'wifi',    adminOnly: true },
  { to: '/sites',        end: false, label: 'Sites',         icon: 'building', adminOnly: true },
];

const Icon = ({ name }: { name: string }) => {
  const cls = 'w-5 h-5 shrink-0';
  if (name === 'grid')     return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5Zm9-9A2.25 2.25 0 0 0 11 4.25v2.5A2.25 2.25 0 0 0 13.25 9h2.5A2.25 2.25 0 0 0 18 6.75v-2.5A2.25 2.25 0 0 0 15.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 11 13.25v2.5A2.25 2.25 0 0 0 13.25 18h2.5A2.25 2.25 0 0 0 18 15.75v-2.5A2.25 2.25 0 0 0 15.75 11h-2.5Z" clipRule="evenodd" /></svg>;
  if (name === 'users')    return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" /></svg>;
  if (name === 'person')   return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" /></svg>;
  if (name === 'calendar') return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" /></svg>;
  if (name === 'clock')    return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" /></svg>;
  if (name === 'edit')     return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" /></svg>;
  if (name === 'lock')     return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg>;
  if (name === 'wifi')     return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path d="M16.72 11.06A10.94 10.94 0 0 0 10 8.5c-2.613 0-5.013.987-6.72 2.56l1.42 1.498A8.96 8.96 0 0 1 10 10.5c1.99 0 3.826.65 5.3 1.738l1.42-1.178ZM10 15a2 2 0 0 0-2 2h4a2 2 0 0 0-2-2ZM5.19 13.278A6.97 6.97 0 0 1 10 11.5c1.831 0 3.513.705 4.81 1.86l1.37-1.14A8.97 8.97 0 0 0 10 10a8.97 8.97 0 0 0-6.18 2.22l1.37 1.058Z" /></svg>;
  if (name === 'building') return <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H16v13h.25a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5H4Zm3-11a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 7 5.5Zm.75 3.75A.75.75 0 0 0 7 10v.5a.75.75 0 0 0 1.5 0V10a.75.75 0 0 0-.75-.75Zm2.25-.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>;
  return null;
};

export default function Sidebar() {
  const navigate = useNavigate();
  const { staffUser } = useAuth();
  const role = staffUser?.role ?? '';

  const items = NAV.filter(n => {
    if (n.adminOnly) return role === 'admin';
    if (n.adminHr)   return ['admin','hr'].includes(role);
    return true;
  });

  return (
    <aside className="w-60 flex flex-col bg-brand-800 text-white shrink-0">
      <div className="px-5 py-6 border-b border-brand-700">
        <div className="font-semibold text-lg tracking-tight">Apex Workforce</div>
        <div className="text-brand-200 text-xs mt-0.5">SAB Time &amp; Attendance</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(item => (
          <NavLink
            key={item.to} to={item.to} end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-700/50 hover:text-white'
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-brand-700">
        <div className="px-3 py-2 mb-1">
          <div className="text-sm font-medium truncate">{staffUser?.fullName ?? '—'}</div>
          <div className="text-xs text-brand-300 capitalize">{role}</div>
        </div>
        <button
          onClick={() => signOut(auth).then(() => navigate('/login'))}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-200 hover:bg-brand-700/50 hover:text-white transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z" clipRule="evenodd" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
