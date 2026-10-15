import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

const items = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/students', label: 'Students' },
  { to: '/spending', label: 'Spending' },
  { to: '/mail', label: 'Mail' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="hidden bg-[#05070d] text-white lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <img src="/bitvion-logo.jpg" alt="Bitvion Groups" className="h-14 w-14 rounded-full object-cover" />
          <div>
            <p className="text-sm font-semibold tracking-[0.16em]">BITVION</p>
            <p className="text-[11px] tracking-[0.12em] text-sky-300">CRM</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#38bdf8]' : 'text-stone-300 hover:bg-white/5 hover:text-white'}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-4 pb-4 text-[11px] tracking-wide text-sky-200/80">Building businesses. Creating growth.</p>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <img src="/bitvion-logo.jpg" alt="" className="h-9 w-9 rounded-full object-cover" />
            <p className="truncate text-sm font-semibold tracking-wide">Bitvion CRM</p>
          </div>
          <p className="hidden text-sm text-stone-500 lg:block">Bitvion CRM</p>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden truncate text-stone-600 sm:block">{user?.name}</span>
            <button className="btn-secondary shrink-0" type="button" onClick={() => void logout().then(() => navigate('/login'))}>Sign out</button>
          </div>
        </header>
        <main id="main" className="px-3 py-4 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile">
          <div className="grid grid-cols-4">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-h-14 items-center justify-center px-1 text-center text-xs font-medium ${isActive ? 'text-sky-700' : 'text-stone-500'}`}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
