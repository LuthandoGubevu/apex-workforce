import { NavLink } from 'react-router-dom';
import {
  HomeIcon, UsersIcon, BuildingOfficeIcon, CpuChipIcon,
  ClockIcon, CalendarDaysIcon, UserGroupIcon,
  WrenchScrewdriverIcon, PencilSquareIcon, FingerPrintIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';

const isAdminHr  = (r?: string) => r === 'admin' || r === 'hr';
const isAdmin    = (r?: string) => r === 'admin';

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role;

  const items = [
    { to: '/',             label: 'Dashboard',     icon: HomeIcon,             show: true },
    { to: '/employees',    label: 'Employees',      icon: UsersIcon,            show: isAdminHr(role) },
    { to: '/sites',        label: 'Sites',          icon: BuildingOfficeIcon,   show: isAdmin(role) },
    { to: '/stations',     label: 'Stations',       icon: CpuChipIcon,          show: isAdmin(role) },
    { to: '/access-groups',label: 'Access Groups',  icon: UserGroupIcon,        show: isAdmin(role) },
    { to: '/clock-events', label: 'Clock Events',   icon: ClockIcon,            show: isAdminHr(role) },
    { to: '/attendance',   label: 'Attendance',     icon: CalendarDaysIcon,     show: isAdminHr(role) },
    { to: '/on-site-now',  label: 'On Site Now',    icon: BuildingOfficeIcon,   show: true },
    { to: '/corrections',  label: 'Corrections',    icon: WrenchScrewdriverIcon,show: isAdminHr(role) },
    { to: '/enrolment',    label: 'Enrolment',      icon: FingerPrintIcon,      show: isAdminHr(role) },
  ].filter(i => i.show);

  return (
    <aside className="w-60 flex flex-col bg-brand-800 text-white shrink-0">
      <div className="px-5 py-6 border-b border-brand-700">
        <div className="font-semibold text-lg tracking-tight">Apex Workforce</div>
        <div className="text-brand-200 text-xs mt-0.5">Biometric Time &amp; Attendance</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-200 hover:bg-brand-700 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-brand-700">
        <div className="text-brand-300 text-xs">{user?.email}</div>
        <div className="text-brand-400 text-xs capitalize">{role}</div>
      </div>
    </aside>
  );
}
