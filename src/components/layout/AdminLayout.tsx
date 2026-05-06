"use client";
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import UpdateBanner from '@/components/UpdateBanner';

function getPageTitle(pathname: string): string {
  if (pathname === '/admin/dashboard') return 'Dashboard';
  if (pathname.includes('/overview')) return 'Vista General';
  if (pathname.includes('/database')) return 'Datos Globales';
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
  if (pathname === '/admin/messages') return 'Mensajes';
  if (pathname === '/admin/notifications') return 'Notificaciones';
  if (pathname === '/admin/profile') return 'Perfil';
  return 'Admin';
}

const AdminLayout = () => {
  const { pathname } = useLocation();
  const title = getPageTitle(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Inside a specific church the ChurchDetailsLayout already shows the church
  // name + tabs in a compact row, so we hide the redundant top-bar title to
  // save vertical space.
  const isInsideChurch = /^\/admin\/churches\/[^/]+\//.test(pathname);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#09090b' }}>
      <UpdateBanner />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 40, display: 'block',
          }}
          className="lg:hidden"
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
      }} className="lg:!relative lg:!transform-none lg:!translate-x-0 lg:!z-auto lg:!pointer-events-auto">
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar - hidden on desktop when inside a church (church layout has its own header).
            On mobile we keep a slim row just for the hamburger button. */}
        <div
          className={isInsideChurch ? 'lg:hidden' : ''}
          style={{
            height: 52, flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center',
            padding: '0 16px', gap: 12,
            background: '#09090b',
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="lg:hidden"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#111113', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#a1a1aa', flexShrink: 0,
            }}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: '#fafafa', flexShrink: 0 }}>
            {title}
          </span>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '12px' }} className={isInsideChurch ? 'lg:p-4' : 'lg:p-6'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
