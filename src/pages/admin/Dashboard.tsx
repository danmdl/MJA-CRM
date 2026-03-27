"use client";
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #22c55e, #15803d)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #f43f5e, #be123c)',
];

const CHURCH_ICON_BGS = [
  'rgba(139,92,246,0.18)',
  'rgba(59,130,246,0.10)',
  'rgba(34,197,94,0.10)',
  'rgba(245,158,11,0.10)',
  'rgba(244,63,94,0.10)',
];

const ACTIVITY_DOTS = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#f43f5e'];

function pickGradient(id: string) {
  const sum = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length];
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  return [(firstName || '')[0], (lastName || '')[0]].filter(Boolean).join('').toUpperCase() || '?';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

const card: React.CSSProperties = {
  background: '#111113',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  overflow: 'hidden',
};

const cardHeader: React.CSSProperties = {
  padding: '14px 18px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 13px', borderRadius: 7, fontSize: 12.5, fontWeight: 500,
  cursor: 'pointer', background: 'transparent', color: '#a1a1aa',
  border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none',
  fontFamily: "'Geist', sans-serif",
};

const Dashboard = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [contacts, cells, churches] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('cells').select('id', { count: 'exact', head: true }),
        supabase.from('churches').select('id', { count: 'exact', head: true }),
      ]);
      return {
        contacts: contacts.count ?? 0,
        cells: cells.count ?? 0,
        churches: churches.count ?? 0,
      };
    },
  });

  const { data: recentContacts = [] } = useQuery({
    queryKey: ['recent-contacts-dashboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data ?? []) as any[];
    },
  });

  const { data: churches = [] } = useQuery({
    queryKey: ['churches-dashboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('churches')
        .select('id, name, is_pinned, pin_order')
        .order('is_pinned', { ascending: false })
        .order('pin_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })
        .limit(5);
      return (data ?? []) as any[];
    },
  });

  const statCards = [
    {
      label: 'Contactos',
      value: stats?.contacts ?? 0,
      emoji: '👥',
      iconBg: 'rgba(139,92,246,0.18)',
      iconColor: '#a78bfa',
      delta: '↑ Total registrados',
    },
    {
      label: 'Células activas',
      value: stats?.cells ?? 0,
      emoji: '🏘️',
      iconBg: 'rgba(34,197,94,0.10)',
      iconColor: '#22c55e',
      delta: '↑ Total registradas',
    },
    {
      label: 'Iglesias',
      value: stats?.churches ?? 0,
      emoji: '⛪',
      iconBg: 'rgba(59,130,246,0.10)',
      iconColor: '#3b82f6',
      delta: '↑ Total registradas',
    },
    {
      label: 'Eventos este mes',
      value: '—',
      emoji: '📅',
      iconBg: 'rgba(245,158,11,0.10)',
      iconColor: '#f59e0b',
      delta: 'Próximamente',
    },
  ];

  if (statsLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...card, padding: '16px 18px', height: 110, opacity: 0.4 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#a1a1aa' }}>{s.label}</span>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: s.iconBg, color: s.iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>{s.emoji}</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1, color: '#fafafa' }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}>
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>

        {/* Recent contacts table */}
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>Contactos recientes</div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 1 }}>Últimas incorporaciones</div>
            </div>
            <Link to="/admin/churches" style={ghostBtn}>Ver todos →</Link>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Nombre', 'Teléfono', 'Estado', 'Fecha'].map(h => (
                  <th key={h} style={{
                    padding: '9px 18px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                    textTransform: 'uppercase', color: '#52525b',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.02)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentContacts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px 18px', textAlign: 'center', color: '#52525b', fontSize: 13 }}>
                    Sin contactos recientes
                  </td>
                </tr>
              ) : recentContacts.map((contact: any, i: number) => (
                <tr key={contact.id}>
                  <td style={{ padding: '11px 18px', fontSize: 13, borderBottom: i < recentContacts.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: pickGradient(contact.id || String(i)),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white',
                      }}>{getInitials(contact.first_name, contact.last_name)}</div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#fafafa' }}>
                          {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#a1a1aa' }}>
                          {contact.email || contact.phone || ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '11px 18px', fontSize: 13, color: '#a1a1aa', borderBottom: i < recentContacts.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    {contact.phone || '—'}
                  </td>
                  <td style={{ padding: '11px 18px', borderBottom: i < recentContacts.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: 'rgba(34,197,94,0.10)', color: '#22c55e',
                      fontFamily: "'Geist Mono', monospace",
                    }}>Activo</span>
                  </td>
                  <td style={{
                    padding: '11px 18px', fontSize: 12, color: '#a1a1aa',
                    borderBottom: i < recentContacts.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    fontFamily: "'Geist Mono', monospace",
                  }}>
                    {contact.created_at ? formatDate(contact.created_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Pinned churches */}
          <div style={card}>
            <div style={cardHeader}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>Iglesias</div>
                <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 1 }}>Fijadas arriba</div>
              </div>
              <Link to="/admin/churches" style={ghostBtn}>Ver todas →</Link>
            </div>
            {churches.length === 0 ? (
              <div style={{ padding: '20px 18px', textAlign: 'center', color: '#52525b', fontSize: 13 }}>
                Sin iglesias registradas
              </div>
            ) : churches.slice(0, 3).map((church: any, i: number) => (
              <Link
                key={church.id}
                to={`/admin/churches/${church.id}/overview`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 18px', textDecoration: 'none',
                  borderBottom: i < Math.min(churches.length, 3) - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: CHURCH_ICON_BGS[i % CHURCH_ICON_BGS.length],
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>⛪</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {church.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#a1a1aa' }}>
                    {church.is_pinned ? 'Fijada' : 'Iglesia'}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Activity feed */}
          <div style={{ ...card, flex: 1 }}>
            <div style={cardHeader}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>Actividad reciente</div>
            </div>
            {recentContacts.length === 0 ? (
              <div style={{ padding: '20px 18px', textAlign: 'center', color: '#52525b', fontSize: 13 }}>
                Sin actividad reciente
              </div>
            ) : recentContacts.slice(0, 3).map((contact: any, i: number) => (
              <div key={contact.id} style={{
                display: 'flex', gap: 12, padding: '11px 18px',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  marginTop: 5, flexShrink: 0,
                  background: ACTIVITY_DOTS[i % ACTIVITY_DOTS.length],
                }} />
                <div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#fafafa' }}>
                    Nuevo contacto:{' '}
                    <strong>
                      {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                    </strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#52525b', fontFamily: "'Geist Mono', monospace" }}>
                    {contact.created_at ? formatDate(contact.created_at) : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
