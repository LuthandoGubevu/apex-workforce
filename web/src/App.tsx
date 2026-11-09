import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Employees from '@/pages/Employees';
import Sites from '@/pages/Sites';
import Stations from '@/pages/Stations';
import AccessGroups from '@/pages/AccessGroups';
import ClockEvents from '@/pages/ClockEvents';
import Attendance from '@/pages/Attendance';
import OnSiteNow from '@/pages/OnSiteNow';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-brand-800 text-sm">Loading…</div>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="sites" element={<Sites />} />
        <Route path="stations" element={<Stations />} />
        <Route path="access-groups" element={<AccessGroups />} />
        <Route path="clock-events" element={<ClockEvents />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="on-site-now" element={<OnSiteNow />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
