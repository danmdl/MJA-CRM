"use client";
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';
import UpdateBanner from '@/components/UpdateBanner';
import { AppBanner } from '@/components/AppBanner';
import GlobalContactSearch from '@/components/admin/GlobalContactSearch';
import { useOutboxReminder } from '@/hooks/use-outbox-reminder';
import { useLoginNotifications } from '@/hooks/use-login-notifications';

function getPageTitle(pathname: string): string {
  if (pathname === '/admin/dashboard') return 'Dashboard';
  if (pathname.includes('/overview')) return 'Vista General';
  if (pathname.includes('/team')) return 'Equipo';
  if (pathname.includes('/cuerdas')) return 'Cuerdas';
  if (pathname.includes('/pool')) return 'Semillero';
  if (pathname.includes('/procesos')) return 'Procesos';
  if (pathname.includes('/hogares')) return 'Hogares de Paz';
  if (pathname.includes('/validator')) return 'Validador de Datos';
  if (pathname.includes('/zonas')) return 'Zonas y Barrios';
  if (pathname.includes('/mapa')) return 'Mapa';
  if (pathname.startsWith('/admin/churches')) return 'Ministerio';
  if (pathname === '/admin/permissions') return 'Permisos';
  if (pathname === '/admin/csv-sandbox') return 'Sandbox CSV';
  if (pathname === '/admin/messages') return 'Mensajes';
  if (pathname === '/admin/notifications') return 'Notificaciones';
  if (pathname === '/admin/profile') return 'Perfil';
  return 'Admin';
}

const AdminLayout = () => {
  const { pathname } = useLocation();
  const title = getPageTitle(pathname);
  // Default the sidebar open on desktop (md+) so the layout matches
  // what users were used to before — but still let them collapse it
  // via the hamburger. On mobile we start closed so the page content
  // owns the viewport. Reading window once on mount is fine here;
  // the layout doesn't need to track resize to a different default.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  // Daily nudge for users with contacts pending in their MJA outbox.
  // Internally throttled to once per user per day.
  useOutboxReminder();
  // Once-per-session toasts for new MJA crossings + unread messages.
  // Internally throttled via sessionStorage so navigations don't refire it.
  useLoginNotifications();
  // Inside a specific church the ChurchDetailsLayout already shows the church
  // name + tabs in a compact row, so we hide the redundant top-bar title to
  // save vertical space.
  const isInsideChurch = /^\/admin\/churches\/[^/]+\//.test(pathname);
  // Procesos (kanban) and Asistencia (calendario / lista por etapa)
  // both need full viewport width — the sidebar auto-collapses on
  // these pages and only the hamburger can bring it back. Keep this
  // list small: only add pages here when the content truly needs
  // 100% width and the sidebar would just be eating room.
  const isFullWidthPage = pathname.endsWith('/procesos') || pathname.endsWith('/asistencia');

  // Global keyboard shortcut: Cmd+K (mac) / Ctrl+K (win/linux) opens the
  // contact search from anywhere in the admin area. preventDefault is
  // important — Cmd+K is also the browser's "focus search bar" on some
  // browsers and we want our shortcut to win inside the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Inside a church, ChurchDetailsLayout renders its own hamburger
  // inline with the tab bar. It signals us via this custom event since
  // the sidebar's open/closed state lives in this component and not in
  // a shared store.
  useEffect(() => {
    const onToggle = () => setSidebarOpen(v => !v);
    window.addEventListener('mja-toggle-sidebar', onToggle);
    return () => window.removeEventListener('mja-toggle-sidebar', onToggle);
  }, []);

  return (
    // Outer column so the global app banner sits ABOVE the
    // sidebar+main row. The banner takes its natural height and the
    // sidebar/main flex row below it gets whatever's left.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#09090b' }}>
      <AppBanner />
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <UpdateBanner />

      {/* Dim overlay — click outside the sidebar to close.
          Mobile: always renders so the user can dismiss.
          Desktop: only on full-width pages (Procesos / Asistencia)
          where the sidebar is in overlay mode and covers the
          ChurchDetailsLayout hamburger; without this the user
          couldn't reach any close affordance once the sidebar was
          open. On regular church pages the sidebar pins into the
          flex row (no overlap) so the overlay isn't needed. */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 40,
          }}
          className={isFullWidthPage ? '' : 'md:hidden'}
        />
      )}

      {/* Sidebar — hidden on mobile unless open. On lg+ it's positioned in flow (relative). */}
      <div style={{
        position: 'fixed' as const,
        top: 0, left: 0, bottom: 0,
        width: 220,
        zIndex: 50,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-220px)',
        transition: 'transform 0.25s ease',
        pointerEvents: sidebarOpen ? 'auto' : 'none',
        overflow: 'hidden',
      }} className={
        // Sidebar layout rules:
        //   - Kanban (Procesos): always overlay so the kanban gets the
        //     full viewport. Hamburger is the only way in/out.
        //   - Anywhere else: pin into the flex row on md+ ONLY when
        //     the user has it open. Closing the sidebar (hamburger
        //     click) drops it back into translate(-220px) overlay
        //     mode so the main content reclaims the space.
        isFullWidthPage
          ? ''
          : sidebarOpen
            ? 'md:!relative md:!transform-none md:!translate-x-0 md:!z-auto md:!pointer-events-auto'
            : ''
      }>
        <Sidebar onNavigate={() => setSidebarOpen(false)} onOpenSearch={() => setSearchOpen(true)} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar — hidden entirely when inside a specific church (the
            ChurchDetailsLayout renders its own combined hamburger + tab
            row, so we don't need a second 44px strip above it). The
            Kanban page is the exception: it has no tab row of its own,
            so we keep the topbar for the hamburger trigger there. */}
        <div
          style={{
            // Hide the top bar entirely once we're inside a specific
            // church — ChurchDetailsLayout renders its own hamburger
            // on the tab row so duplicating one up here just eats
            // 44px of vertical space and confuses the user. Previously
            // we exempted "full width" pages (Procesos, Asistencia)
            // but those have the ChurchDetailsLayout hamburger too,
            // so the exemption was a leftover from when those pages
            // weren't nested under ChurchDetailsLayout.
            display: isInsideChurch ? 'none' : 'flex',
            height: 44, flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            alignItems: 'center',
            padding: '0 12px', gap: 8,
            background: '#09090b',
          }}
        >
          {/* Hamburger — always visible so the user can collapse the
              sidebar on any page to reclaim space, not just on
              Procesos. */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#111113', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#a1a1aa', flexShrink: 0,
            }}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Title — only shown outside church context */}
          {!isInsideChurch && (
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: '#fafafa', flexShrink: 0 }}>
              {title}
            </span>
          )}

          {/* Search trigger — only outside church context. Inside a church
              the sidebar and Cmd+K shortcut are sufficient. */}
          {!isInsideChurch && (
            <button
              onClick={() => setSearchOpen(true)}
              title="Buscar contactos (Ctrl/Cmd + K)"
              style={{
                marginLeft: 'auto',
                height: 32, padding: '0 10px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: '#111113', display: 'flex', alignItems: 'center',
                gap: 6, cursor: 'pointer', color: '#a1a1aa', flexShrink: 0,
              }}
            >
              <Search size={14} />
              <span style={{ fontSize: 12 }} className="hidden sm:inline">Buscar</span>
              <span style={{ fontSize: 10, color: '#71717a' }} className="hidden sm:inline">⌘K</span>
            </button>
          )}
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '12px' }} className={isInsideChurch ? 'md:p-4' : 'md:p-6'}>
          <Outlet />
        </main>
      </div>

      {/* Global contact search — accessible via Cmd/Ctrl+K from anywhere in
          the admin area, the topbar Buscar button, or the Sidebar entry. */}
      <GlobalContactSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
    </div>
  );
};

export default AdminLayout;
