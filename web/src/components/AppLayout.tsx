import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AppMark, Wordmark } from './Logo';
import { Avatar } from './Avatar';

const NAV = [
  { to: '/', label: 'Home', end: true, minLead: false },
  { to: '/live', label: 'Live', end: false, minLead: false },
  { to: '/members', label: 'Members', end: false, minLead: false },
  { to: '/timesheet', label: 'Timesheets', end: false, minLead: false },
  { to: '/reports', label: 'Reports', end: false, minLead: true },
  { to: '/approvals', label: 'Approvals', end: false, minLead: true },
  { to: '/settings', label: 'Settings', end: false, minLead: true },
  { to: '/audit', label: 'Audit', end: false, minLead: true },
];

export function AppLayout() {
  const { user, isLead, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="h-screen flex bg-bg-base text-text-primary overflow-hidden">
      {/* Left icon rail (PRD §7.1). */}
      <aside className="w-16 shrink-0 border-r border-border-subtle flex flex-col items-center py-4 gap-6">
        <AppMark />
        <div className="flex-1" />
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          title="Sign out"
          className="text-text-muted hover:text-accent transition-colors text-xl"
        >
          ⏻
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top horizontal nav. */}
        <header className="h-14 shrink-0 border-b border-border-subtle flex items-center justify-between px-6 gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <Wordmark className="text-h2 hidden sm:block" />
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV.filter((n) => !n.minLead || isLead).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-sm text-sm whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-accent/[0.14] text-text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden md:block">
              <div className="text-sm leading-tight">{user?.name}</div>
              <div className="text-caption uppercase text-text-muted">{user?.role.replace('_', ' ')}</div>
            </div>
            <Avatar name={user?.name ?? '?'} avatarUrl={user?.avatarUrl} size={36} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
