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

  // Load new contacts count (last 24h)
  const loadNewContacts = async () => {
    if (!profile?.church_id) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('church_id', profile.church_id)
      .is('deleted_at', null)
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
        className="relative p-1.5 rounded-lg hover:bg-[#18181b] transition-colors"
        title="Notificaciones"
      >
        <Bell className="h-4.5 w-4.5 text-[#a1a1aa]" style={{ width: 18, height: 18 }} />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-[#111113] border border-[#27272a] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#27272a]">
            <p className="text-xs font-medium text-[#fafafa]">Notificaciones</p>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {unreadMessages > 0 && (
              <a href="/admin/messages" className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#18181b] transition-colors no-underline" onClick={() => setShowDropdown(false)}>
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                <div>
                  <p className="text-xs text-[#fafafa]">{unreadMessages} mensaje{unreadMessages !== 1 ? 's' : ''} sin leer</p>
                  <p className="text-[10px] text-[#71717a]">Abrí Mensajes para verlos</p>
                </div>
              </a>
            )}
            {newContacts > 0 && (
              <a href={`/admin/churches/${profile?.church_id}/pool`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#18181b] transition-colors no-underline" onClick={() => setShowDropdown(false)}>
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                <div>
                  <p className="text-xs text-[#fafafa]">{newContacts} contacto{newContacts !== 1 ? 's' : ''} nuevo{newContacts !== 1 ? 's' : ''} (24h)</p>
                  <p className="text-[10px] text-[#71717a]">Abrí el Semillero para verlos</p>
                </div>
              </a>
            )}
            {totalCount === 0 && (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-[#71717a]">No hay notificaciones nuevas</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
