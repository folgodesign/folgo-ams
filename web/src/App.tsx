import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Spinner } from './components/ui';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/Login';
import { ActivatePage } from './pages/Activate';
import { HomePage } from './pages/Home';
import { LiveBoardPage } from './pages/LiveBoard';
import { MembersPage } from './pages/Members';
import { TimesheetPage } from './pages/Timesheet';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { ApprovalsPage } from './pages/Approvals';
import { AuditPage } from './pages/Audit';
import { WallPage } from './pages/Wall';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full grid place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireLead({ children }: { children: React.ReactNode }) {
  const { isLead } = useAuth();
  if (!isLead) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loading } = useAuth();
  if (loading)
    return (
      <div className="h-full grid place-items-center">
        <Spinner />
      </div>
    );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/wall/:orgId" element={<WallPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="live" element={<RequireLead><LiveBoardPage /></RequireLead>} />
        <Route path="members" element={<MembersPage />} />
        <Route path="timesheet" element={<TimesheetPage />} />
        <Route path="reports" element={<RequireLead><ReportsPage /></RequireLead>} />
        <Route path="approvals" element={<RequireLead><ApprovalsPage /></RequireLead>} />
        <Route path="settings" element={<RequireLead><SettingsPage /></RequireLead>} />
        <Route path="audit" element={<RequireLead><AuditPage /></RequireLead>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
