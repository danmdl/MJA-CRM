import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { usePermissions, ROLE_LABELS } from '@/lib/permissions';
import { supabase } from '@/integrations/supabase/client';

interface NavItemConfig {
  to: string;
  emoji: string;
  label: string;
  badge?: number;
}

const Sidebar = () => {
  const { profile } = useSession();
  const navigate = useNavigate();
  const { canSeeAllAnalytics, canAccessPermissions } = usePermissions();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join('').toUpperCase() || 'U';

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean).join(' ') || profile?.email || 'Usuario';

  const sections: { title: string; items: NavItemConfig[] }[] = [
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
        { to: '/admin/profile', emoji: '👤', label: 'Perfil' },
      ],
    },
  ];

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
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          borderRadius: 8, overflow: 'hidden',
          boxShadow: '0 0 12px rgba(255,194,51,0.35)',
        }}>
          <img src="/logo.png" alt="MJA Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: '#fafafa' }}>MJA CRM</div>
          <div style={{ fontSize: 11, color: '#a1a1aa' }}>Panel de administración</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map(({ title, items }) => (
          <div key={title}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const, color: '#52525b',
              padding: '8px 10px 4px', marginTop: 4,
            }}>{title}</div>
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
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
                    {item.badge ? (
                      <span style={{
                        background: 'rgba(255,194,51,0.18)', color: '#FFD966',
                        fontSize: 10, fontWeight: 600, padding: '1px 6px',
                        borderRadius: 20, fontFamily: "'Geist Mono', monospace",
                      }}>{item.badge.toLocaleString()}</span>
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="w-full flex items-center gap-[9px] px-[10px] py-[7px] rounded-[7px] cursor-pointer bg-transparent border-none text-left hover:bg-[#18181b] transition-colors duration-150"
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
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
