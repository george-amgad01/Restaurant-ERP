import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  RefreshCw,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { useSettings } from '@/context/SettingsContext';
import { cn, initials } from '@/lib/utils';
import { Button, PageLoader, Spinner } from '@/components/ui';
import { Link, NavLink } from 'react-router-dom';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: ['dashboard.view'] },
  { to: '/pos', label: 'Point of Sale', icon: CreditCard, permissions: ['pos.create_order'] },
  { to: '/orders', label: 'Orders', icon: ClipboardList, permissions: ['orders.view'] },
  { to: '/kitchen', label: 'Kitchen', icon: ChefHat, permissions: ['kds.view'] },
  { to: '/menu', label: 'Menu & Recipes', icon: UtensilsCrossed, permissions: ['menu.manage'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, permissions: ['inventory.view'] },
  { to: '/expenses', label: 'Expenses', icon: Wallet, permissions: ['expenses.view', 'expenses.create'] },
  { to: '/analytics', label: 'Reports', icon: BarChart3, permissions: ['dashboard.view'] },
  { to: '/ai', label: 'AI Assistant', icon: Sparkles, permissions: ['ai.use', 'ai.view_reports'] },
  { to: '/employees', label: 'Employees', icon: Users, permissions: ['employees.manage'] },
  { to: '/activity', label: 'Activity Log', icon: Activity, permissions: ['activity.view'] },
  { to: '/sync', label: 'Sync', icon: RefreshCw, permissions: [] },
  { to: '/settings', label: 'Settings', icon: Settings, permissions: ['settings.manage'] },
];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right text-xs text-ink-500 md:block">
      <div className="font-medium text-ink-700">
        {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
      </div>
      <div>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  );
}

function SyncPill() {
  const { online, pending, failed, syncing, syncNow } = useSync();
  return (
    <button
      onClick={() => void syncNow()}
      title={online ? 'Connected — click to sync now' : 'Offline — operations are queued'}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        !online
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : failed > 0
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : pending > 0
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {syncing ? <Spinner className="h-3 w-3" /> : online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {!online ? 'Offline' : failed > 0 ? `${failed} failed` : pending > 0 ? `${pending} pending` : 'Live'}
    </button>
  );
}

export function AppLayout() {
  const { profile, loading, has, signOut } = useAuth();
  const { settings } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (loading) return <PageLoader label="Signing you in…" />;

  const visible = nav.filter((item) => item.permissions.length === 0 || item.permissions.some(has));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
          <UtensilsCrossed className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {settings?.restaurant_name ?? 'Restaurant ERP'}
          </p>
          <p className="text-[11px] text-ink-400">Operations Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                isActive
                  ? 'bg-brand-600/15 text-brand-300'
                  : 'text-ink-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600/20 text-xs font-semibold text-brand-300">
            {initials(profile?.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{profile?.full_name}</p>
            <p className="truncate text-[11px] capitalize text-ink-400">{profile?.role?.name ?? 'Staff'}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-ink-400 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ink-100">
      <aside className="hidden w-64 shrink-0 bg-ink-900 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-ink-900 shadow-pop">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-ink-300 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-ink-800">
                {visible.find((n) => location.pathname.startsWith(n.to))?.label ?? 'Restaurant ERP'}
              </p>
              <p className="text-[11px] text-ink-400">{settings?.branch_id ? 'Main branch' : 'Operations'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SyncPill />
            <Clock />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">
          <Outlet />
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-ink-400 lg:px-6">
          <span>Restaurant ERP v1.0 — integrated operations</span>
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" /> Supabase + Gemini
          </span>
        </footer>
      </div>
    </div>
  );
}

export function RequirePermission({ permissions, children }: { permissions: string[]; children: React.ReactNode }) {
  const { has } = useAuth();
  if (permissions.length === 0 || permissions.some(has)) return <>{children}</>;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-500">
        <X className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink-800">Access restricted</h2>
      <p className="max-w-sm text-sm text-ink-500">
        Your role does not include access to this module. Ask an owner to update your permissions.
      </p>
      <Link to="/pos" className="mt-2">
        <Button variant="outline" size="sm">Back to POS</Button>
      </Link>
    </div>
  );
}

export function ProtectedRoute() {
  const { session, loading, configured } = useAuth();
  if (loading) return <PageLoader label="Loading workspace…" />;
  if (!configured) return <Navigate to="/setup" replace />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
