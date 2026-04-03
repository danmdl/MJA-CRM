import React from 'react';
import { NavLink, useNavigate, useMatch } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { usePermissions, ROLE_LABELS } from '@/lib/permissions';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import NotificationBell from '@/components/admin/NotificationBell';
import PendingLeaderMatches from '@/components/admin/PendingLeaderMatches';

interface NavItemConfig {
  to: string;
  emoji: string;
  label: string;
}

const Sidebar = ({ onNavigate }: { onNavigate?: () => void } = {}) => {
  const { profile } = useSession();
  const navigate = useNavigate();
  const { canSeeAllAnalytics, canAccessPermissions, canSeeAllChurches, canSeeBaseDatos, canSeePool, canSeeOwnChurchAnalytics, canSeeCelulas, canSeeHistorial } = usePermissions();

  // Detect if we're inside a specific church
  const churchMatch = useMatch('/admin/churches/:churchId/*');
  const activeChurchId = churchMatch?.params?.churchId || null;

  // For single-church users, always use their assigned church
  const singleChurchId = !canSeeAllChurches() ? profile?.church_id : null;
  const currentChurchId = singleChurchId || activeChurchId;

  // Fetch church name when we have a church context
  const { data: churchData } = useQuery({
    queryKey: ['church-name-sidebar', currentChurchId],
    queryFn: async () => {
      const { data } = await supabase.from('churches').select('name').eq('id', currentChurchId!).single();
      return data;
    },
    enabled: !!currentChurchId,
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join('').toUpperCase() || (profile?.email?.[0] || 'U').toUpperCase();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean).join(' ') || profile?.email || 'Usuario';

  // When inside a church (either by navigation or single-church assignment)
  const isInsideChurch = !!currentChurchId;

  const churchSections: { title: string; items: NavItemConfig[] }[] = [
    {
      title: churchData?.name || 'Iglesia',
      items: [
        ...((canSeeAllAnalytics() || canSeeOwnChurchAnalytics()) ? [{ to: `/admin/churches/${currentChurchId}/overview`, emoji: '📋', label: 'Resumen' }] : []),
        ...(canSeeBaseDatos() ? [{ to: `/admin/churches/${currentChurchId}/database`, emoji: '👥', label: 'Base de Datos' }] : []),
        ...((canSeeAllAnalytics() || canSeeOwnChurchAnalytics()) ? [{ to: `/admin/churches/${currentChurchId}/team`, emoji: '🤝', label: 'Equipo' }] : []),
        ...((canSeeAllAnalytics() || canSeeOwnChurchAnalytics()) ? [{ to: `/admin/churches/${currentChurchId}/cuerdas`, emoji: '🏘️', label: 'Cuerdas' }] : []),
        ...(canSeeCelulas() ? [{ to: `/admin/churches/${currentChurchId}/celulas`, emoji: '🏠', label: 'Células' }] : []),
        ...(canSeePool() ? [{ to: `/admin/churches/${currentChurchId}/pool`, emoji: '🏊', label: 'Pool' }] : []),
        ...((canSeeAllAnalytics() || canSeeOwnChurchAnalytics()) ? [{ to: `/admin/churches/${currentChurchId}/mapa`, emoji: '🗺️', label: 'Mapa' }] : []),
        ...(canSeeHistorial() ? [{ to: `/admin/churches/${currentChurchId}/historial`, emoji: '📋', label: 'Historial' }] : []),
        ...((canSeeAllAnalytics() || canSeeOwnChurchAnalytics()) ? [{ to: `/admin/churches/${currentChurchId}/papelera`, emoji: '🗑️', label: 'Papelera' }] : []),
      ],
    },
    {
      title: 'Cuenta',
      items: [
        { to: '/admin/messages', emoji: '💬', label: 'Mensajes' },
        ...(canAccessPermissions() ? [{ to: '/admin/permissions', emoji: '🛡️', label: 'Permisos' }] : []),
        ...(canAccessPermissions() ? [{ to: '/admin/logs', emoji: '🔍', label: 'Logs' }] : []),
        { to: '/admin/profile', emoji: '👤', label: 'Perfil' },
        { to: '/admin/info', emoji: 'ℹ️', label: 'Información' },
      ],
    },
  ];

  const globalSections: { title: string; items: NavItemConfig[] }[] = [
    {
      title: 'Principal',
      items: [
        ...(canSeeAllAnalytics() ? [{ to: '/admin/dashboard', emoji: '📊', label: 'Dashboard' }] : []),
        { to: '/admin/churches', emoji: '⛪', label: 'Ministerio' },
      ],
    },
    {
      title: 'Gestión',
      items: [
        { to: '/admin/messages', emoji: '💬', label: 'Mensajes' },
        ...(canAccessPermissions() ? [{ to: '/admin/permissions', emoji: '🛡️', label: 'Permisos' }] : []),
        ...(canAccessPermissions() ? [{ to: '/admin/logs', emoji: '🔍', label: 'Logs' }] : []),
        { to: '/admin/profile', emoji: '👤', label: 'Perfil' },
      ],
    },
  ];

  const sections = isInsideChurch ? churchSections : globalSections;

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: '#111113',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 18px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{ width: 36, height: 36, flexShrink: 0, filter: 'drop-shadow(0 0 8px rgba(255,194,51,0.5))' }}>
          <img src="/logo.png" alt="MJA Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: '#fafafa' }}>MJA CRM</div>
          <div style={{ fontSize: 11, color: '#a1a1aa' }}>Panel de administración</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <NotificationBell />
        </div>
      </div>

      {/* Back to churches button — only for multi-church users inside a church */}
      {isInsideChurch && canSeeAllChurches() && (
        <button
          onClick={() => { navigate('/admin/churches'); onNavigate?.(); }}
          style={{
            margin: '8px 8px 0',
            padding: '6px 10px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: '#a1a1aa',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#18181b')}
          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span>←</span>
          <span>Todas las iglesias</span>
        </button>
      )}

      {/* Pending leader matches */}
      <PendingLeaderMatches />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map(({ title, items }) => (
          <div key={title}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: '#52525b',
              padding: '8px 10px 4px', marginTop: 4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={title}>{title}</div>
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={false}
                onClick={() => onNavigate?.()}
                className={({ isActive }) =>
                  `flex items-center gap-[9px] px-[10px] py-[7px] rounded-[7px] text-[13.5px] no-underline relative transition-all duration-150 ` +
                  (isActive ? 'text-[#FFD966] font-medium' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]')
                }
                style={({ isActive }) => ({ background: isActive ? 'linear-gradient(90deg, rgba(255,194,51,0.18) 0%, rgba(255,194,51,0.06) 100%)' : undefined })}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span style={{
                        position: 'absolute', left: 0, top: '20%', bottom: '20%',
                        width: 2.5, background: '#FFC233', borderRadius: 2,
                      }} />
                    )}
                    <span>{item.emoji}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-1">
          <NavLink
            to="/admin/profile"
            className="flex-1 flex items-center gap-[9px] px-[10px] py-[7px] rounded-[7px] cursor-pointer bg-transparent border-none text-left hover:bg-[#18181b] transition-colors duration-150 no-underline"
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #FFC233 0%, #f43f5e 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
            }}>{initials}</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#fafafa' }}>{fullName}</div>
              <div style={{ fontSize: 10.5, color: '#a1a1aa' }}>
                {ROLE_LABELS[profile?.role || ''] || 'Usuario'}
              </div>
            </div>
          </NavLink>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-[7px] rounded-[7px] cursor-pointer bg-transparent border-none hover:bg-[#18181b] transition-colors duration-150 text-[#52525b] hover:text-[#f43f5e]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
