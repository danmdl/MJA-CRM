"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const NotificationBell = () => {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['notifications', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []) as Notification[];
    },
    enabled: !!session?.user?.id,
    refetchInterval: 30_000,
  });

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) return;
      await supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notificaciones</span>
          {unreadCount > 0 && (
            <button className="text-[11px] text-primary hover:underline" onClick={() => markAllRead.mutate()}>
              Marcar todas como leídas
            </button>
          )}
        </div>
        {(!notifications || notifications.length === 0) ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin notificaciones</div>
        ) : (
          notifications.map(n => (
            <a
              key={n.id}
              href={n.link || '#'}
              className={`block px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
            >
              <div className="flex justify-between items-start">
                <p className={`text-sm ${!n.read ? 'font-medium' : 'text-muted-foreground'}`}>{n.title}</p>
                <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{formatTime(n.created_at)}</span>
              </div>
              {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
            </a>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
