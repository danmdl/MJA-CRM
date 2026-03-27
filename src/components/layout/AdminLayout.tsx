"use client";
import React from 'react';
import Sidebar from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';

function getPageTitle(pathname: string): string {
  if (pathname === '/admin/dashboard') return 'Dashboard';
  if (pathname.includes('/overview')) return 'Vista General';
  if (pathname.includes('/database')) return 'Contactos';
  if (pathname.includes('/team')) return 'Equipo';
  if (pathname.includes('/cells')) return 'Células';
  if (pathname.startsWith('/admin/churches')) return 'Ministerio';
  if (pathname === '/admin/permissions') return 'Permisos';
  if (pathname === '/admin/messages') return 'Mensajes';
  if (pathname === '/admin/profile') return 'Perfil';
  return 'Admin';
}

const AdminLayout = () => {
  const { pathname } = useLocation();
  const title = getPageTitle(pathname);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#09090b' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{
          height: 52, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: 16,
          background: '#09090b',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: '#fafafa' }}>
            {title}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#111113', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8, padding: '6px 12px', fontSize: 13,
              color: '#a1a1aa', width: 200,
            }}>
              🔍 Buscar...
            </div>
            <button style={{
              width: 32, height: 32, borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.07)',
              background: '#111113', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#a1a1aa', fontSize: 14,
            }}>🔔</button>
            <button style={{
              width: 32, height: 32, borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.07)',
              background: '#111113', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#a1a1aa', fontSize: 14,
            }}>⚙️</button>
          </div>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
