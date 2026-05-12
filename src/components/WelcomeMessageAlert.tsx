"use client";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Bell } from 'lucide-react';

// Shows once per browser session (sessionStorage) when the user logs in,
// telling them they have unread messages. Stays open until they dismiss it.
const WelcomeMessageAlert = () => {
  const { session, profile } = useSession();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !profile?.profile_completed || checked) return;

    // Only show once per browser session — sessionStorage clears on tab close
    const sessionKey = `welcome-alert-shown-${userId}`;
    if (sessionStorage.getItem(sessionKey)) {
      setChecked(true);
      return;
    }

    const check = async () => {
      // Count unread messages from the last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('message_recipients')
        .select('*, messages!inner(created_at)', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('read_at', null)
        .gte('messages.created_at', since);

      const c = count || 0;
      if (c > 0) {
        setUnreadCount(c);
        setOpen(true);
      }
      sessionStorage.setItem(sessionKey, 'shown');
      setChecked(true);
    };

    // Small delay so it doesn't flash before the app finishes loading
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, [session?.user?.id, profile?.profile_completed, checked]);

  const handleGoToMessages = () => {
    setOpen(false);
    navigate('/admin/messages');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/15 flex items-center justify-center">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">¡Hola, bienvenido/a!</DialogTitle>
          <DialogDescription className="text-center pt-2">
            Tenés <strong className="text-foreground">{unreadCount} mensaje{unreadCount === 1 ? '' : 's'} sin leer</strong>{unreadCount === 1 ? '' : ''} esperándote.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleGoToMessages} className="w-full gap-2">
            <MessageSquare className="h-4 w-4" />
            Ver mensajes
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} className="w-full">
            Después
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeMessageAlert;
