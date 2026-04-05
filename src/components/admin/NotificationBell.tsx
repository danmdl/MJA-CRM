import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Bell } from 'lucide-react';

const NOTIF_SOUND_URL = 'data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAACAgICAgICAgICAgICBh46Xoamwt7y/wL67trCon5WMhH57eXl7f4SMlZ+osbe8v8C+u7awqJ+VjIR+e3l5e3+EjJWfqLG3vL/Avru2sA==';

const NotificationBell = () => {
  const { session, profile } = useSession();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [newContacts, setNewContacts] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const prevCountRef = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userId = session?.user?.id;

  // Load initial unread count
  const loadUnreadCount = async () => {
    if (!userId) return;
    const { count } = await supabase
      .from('message_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);
    setUnreadMessages(count || 0);
  };

  // Load new contacts count (last 2 hours, created by others)
  const loadNewContacts = async () => {
    if (!profile?.church_id || !userId) return;
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('church_id', profile.church_id)
      .is('deleted_at', null)
      .neq('created_by', userId)
      .gte('created_at', since);
    setNewContacts(count || 0);
  };

  useEffect(() => {
    if (!userId) return;
    loadUnreadCount();
    loadNewContacts();

    // Subscribe to new messages
    const msgChannel = supabase.channel('notif-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_recipients',
        filter: `recipient_id=eq.${userId}`,
      }, () => {
        loadUnreadCount();
        // Play sound
        try { new Audio(NOTIF_SOUND_URL).play().catch(() => {}); } catch {}
      })
      .subscribe();

    // Subscribe to new contacts
    const contactChannel = supabase.channel('notif-contacts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contacts',
      }, () => {
        loadNewContacts();
      })
      .subscribe();

    // Refresh every 60s
    const interval = setInterval(() => { loadUnreadCount(); loadNewContacts(); }, 60000);

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(contactChannel);
      clearInterval(interval);
    };
  }, [userId, profile?.church_id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalCount = unreadMessages + newContacts;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          position: 'relative',
          padding: 4,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Notificaciones"
      >
        <Bell style={{ width: 16, height: 16, color: '#a1a1aa' }} />
        {totalCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -4,
            minWidth: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: 8,
            fontWeight: 700,
            padding: '0 3px',
            lineHeight: 1,
          }}>
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{
          position: 'fixed',
          top: 50,
          left: 60,
          width: 260,
          backgroundColor: '#111113',
          border: '1px solid #27272a',
          borderRadius: 8,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #27272a' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#fafafa', margin: 0 }}>Notificaciones</p>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {unreadMessages > 0 && (
              <a href="/admin/messages" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', textDecoration: 'none', borderBottom: '1px solid #1a1a1a' }} onClick={() => setShowDropdown(false)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3b82f6', flexShrink: 0 }}></span>
                <div>
                  <p style={{ fontSize: 11, color: '#fafafa', margin: 0 }}>{unreadMessages} mensaje{unreadMessages !== 1 ? 's' : ''} sin leer</p>
                  <p style={{ fontSize: 9, color: '#71717a', margin: '2px 0 0' }}>Ir a Mensajes</p>
                </div>
              </a>
            )}
            {newContacts > 0 && (
              <a href={`/admin/churches/${profile?.church_id}/pool`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', textDecoration: 'none' }} onClick={() => setShowDropdown(false)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <div>
                  <p style={{ fontSize: 11, color: '#fafafa', margin: 0 }}>{newContacts} contacto{newContacts !== 1 ? 's' : ''} nuevo{newContacts !== 1 ? 's' : ''}</p>
                  <p style={{ fontSize: 9, color: '#71717a', margin: '2px 0 0' }}>Ir al Semillero</p>
                </div>
              </a>
            )}
            {totalCount === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#71717a', margin: 0 }}>Sin notificaciones nuevas</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
