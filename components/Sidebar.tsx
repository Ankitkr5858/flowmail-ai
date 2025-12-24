import React from 'react';
import { 
  LayoutDashboard, 
  Send, 
  GitBranch, 
  Users, 
  BarChart2,
  FileText,
  Settings, 
  LogOut,
  Mail
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/AuthStore';

const Sidebar: React.FC = () => {
  const { state: auth, actions: authActions } = useAuth();
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
    { icon: Send, label: 'Campaigns', to: '/campaigns' },
    { icon: GitBranch, label: 'Automations', to: '/automations' },
    { icon: Users, label: 'Contacts', to: '/contacts' },
    { icon: FileText, label: 'Content', to: '/content' },
    { icon: BarChart2, label: 'Reports', to: '/reports' },
    { icon: Settings, label: 'Settings', to: '/settings' },
  ];

  const userEmail = auth.user?.email ?? '—';
  const fullName =
    (auth.user as any)?.user_metadata?.full_name ||
    (auth.user as any)?.user_metadata?.name ||
    (auth.status === 'signed_in' ? 'Signed in' : auth.status === 'signed_out' ? 'Not signed in' : 'Not connected');
  const initials = (() => {
    const s = String(fullName || userEmail || 'U').trim();
    const parts = s.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? 'U';
    const b = parts[1]?.[0] ?? '';
    return (a + b).toUpperCase();
  })();

  return (
    <div className="w-64 bg-white text-slate-700 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-200 z-50">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <div className="flex items-center gap-2 font-semibold text-base tracking-tight">
          <Mail className="app-icon app-icon-brand w-6 h-6" />
          <div className="leading-tight">
            <div className="text-slate-900">FlowMail</div>
            <div className="text-[11px] text-slate-500 font-medium">Campaigns & automation</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group ${
                isActive
                  ? 'bg-slate-50 text-slate-900 font-semibold border border-slate-200'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`w-1 self-stretch rounded-full ${isActive ? 'bg-sky-600' : 'bg-transparent'}`} />
                <item.icon className={`app-icon w-5 h-5 ${isActive ? 'app-icon-brand' : 'app-icon-muted'}`} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile / Bottom */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-semibold text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{String(fullName)}</p>
            <p className="text-xs text-slate-500 truncate">{userEmail}</p>
          </div>
          {auth.status === 'signed_in' ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authActions.signOut(); }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              title="Sign out"
            >
              <LogOut className="app-icon app-icon-muted w-4 h-4" />
            </button>
          ) : (
            <NavLink
              to="/login"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              title="Sign in"
            >
              <LogOut className="app-icon app-icon-muted w-4 h-4 rotate-180" />
            </NavLink>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
