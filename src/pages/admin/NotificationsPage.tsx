import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCheck, MessageSquare, UserPlus, ArrowRight, Trash2, Sparkles } from 'lucide-react';
import { showSuccess } from '@/utils/toast';

interface Notification {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const NotificationsPage = () => {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications-page', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase.from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return (data || []) as Notification[];
    },
    enabled: !!userId,
  });

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['notifications-page', userId] });
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    queryClient.invalidateQueries({ queryKey: ['notifications-page', userId] });
    showSuccess('Todas las notificaciones marcadas como leídas.');
  };

  const deleteOld = async () => {
    if (!userId) return;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('notifications').delete().eq('user_id', userId).eq('read', true).lt('created_at', thirtyDaysAgo);
    queryClient.invalidateQueries({ queryKey: ['notifications-page', userId] });
    showSuccess('Notificaciones antiguas eliminadas.');
  };

  const getIcon = (type: string | null) => {
    switch (type) {
      case 'message': return <MessageSquare className="h-4 w-4 text-blue-400" />;
      case 'contact': return <UserPlus className="h-4 w-4 text-green-400" />;
      case 'assignment': return <ArrowRight className="h-4 w-4 text-yellow-400" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `Hace ${diffD}d`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="p-6">
      <div className="flex gap-6">
        {/* LEFT: Notifications */}
        <div className="flex-1 min-w-0 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notificaciones
          </h1>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{unreadCount} sin leer</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead} className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todo como leído
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={deleteOld} className="gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" /> Limpiar antiguas
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando...</div>
      )}

      {!isLoading && (!notifications || notifications.length === 0) && (
        <div className="text-center py-12">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-30 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No hay notificaciones.</p>
          <p className="text-xs text-muted-foreground mt-1">Las notificaciones aparecen cuando recibís mensajes o se crean contactos nuevos.</p>
        </div>
      )}

      {!isLoading && notifications && notifications.length > 0 && (
        <div className="space-y-1">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg px-3 py-3 transition-colors cursor-pointer ${n.read ? 'opacity-60 hover:opacity-80' : 'bg-primary/5 border border-primary/10 hover:bg-primary/10'}`}
              onClick={() => {
                if (!n.read) markAsRead(n.id);
                if (n.link) window.location.href = n.link;
              }}
            >
              <div className="mt-0.5 shrink-0">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm ${n.read ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                    {n.title || 'Notificación'}
                  </p>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>}
                </div>
                {n.message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{formatTime(n.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      </div>

        {/* RIGHT: Novedades del sistema */}
        <div className="w-[320px] shrink-0 hidden lg:block">
          <ChangelogSection />
        </div>
      </div>

      {/* Mobile: show novedades below */}
      <div className="lg:hidden mt-6">
        <ChangelogSection />
      </div>
    </div>
  );
};

const ChangelogSection = () => {
  const [showAll, setShowAll] = useState(false);
  
  const { data: entries } = useQuery<{ id: string; title: string; description: string | null; importance: number; published_at: string }[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const { data } = await supabase.from('changelog')
        .select('id, title, description, importance, published_at')
        .order('published_at', { ascending: false })
        .order('importance', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  if (!entries?.length) return null;

  // Show only first 5 for preview
  const displayEntries = showAll ? entries : entries.slice(0, 5);
  const hasMore = entries.length > 5;

  // Group by date
  const grouped = displayEntries.reduce((acc, e) => {
    const date = e.published_at;
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {} as Record<string, typeof entries>);

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const content = (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{formatDate(date)}</p>
          <div className={`grid gap-1.5 ${showAll ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {items.map(e => (
              <div key={e.id} className="rounded-lg border px-3 py-2.5 bg-muted/20">
                <p className="text-sm font-medium">{e.title}</p>
                {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (showAll) {
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#FFC233]" />
              <h2 className="text-lg font-bold">Novedades del sistema</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowAll(false)} className="text-xs">
              Cerrar
            </Button>
          </div>
          <div className="max-h-[600px] overflow-y-auto pr-2">
            {content}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#FFC233]" />
        <h2 className="text-lg font-bold">Novedades del sistema</h2>
      </div>
      <div className="relative">
        {content}
        {hasMore && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background via-background/90 to-transparent flex items-end justify-center pb-2">
            <Button 
              size="sm" 
              onClick={() => setShowAll(true)}
              className="gap-1.5 text-xs"
            >
              Ver todas ({entries.length})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
