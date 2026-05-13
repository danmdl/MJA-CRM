import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showHighlight, showNotif } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

// One-shot notification toasts triggered the first time a user lands
// on the admin shell in a given browser session. Surfaces two things
// they'd otherwise have to hunt for:
//
//   1. MJA-side crossings (in either direction):
//      - Non-MJA referente: "tenés N contactos nuevos asignados por MJA"
//      - MJA-side referente: "tenés N nuevos contactos recibidos de otras cuerdas"
//      Driven by received_from_mja_* / sent_to_mja_* columns + the
//      trigger that maintains them. Click → goes to Semillero.
//
//   2. Unread messages in the last 24h. Mirrors the count the
//      NotificationBell shows in the header so the user has the
//      same signal even if they don't see the bell on their landing
//      route. Click → goes to /admin/messages.
//
// "Once per session" is tracked via sessionStorage so the toasts
// reappear after a browser restart but not on every page navigation.
// Per-user key so multiple users on the same machine each get their
// own first-paint.

const SS_KEY_PREFIX = 'mja.loginNotif.shown.';

export function useLoginNotifications() {
  const { session, profile } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !profile?.church_id) return;

    const ssKey = `${SS_KEY_PREFIX}${userId}`;
    const alreadyShown = (() => {
      try { return sessionStorage.getItem(ssKey); } catch { return null; }
    })();
    if (alreadyShown === '1') return;

    const fire = async () => {
      const churchId = profile.church_id!;
      const userCuerda = profile.numero_cuerda;

      // ── MJA crossings (unseen, in either direction, scoped to the
      // caller's cuerda). Globals (admin/general/pastor/supervisor)
      // without a numero_cuerda skip this signal because the unseen
      // counter is per-cuerda and they don't own one.
      let mjaCount = 0;
      let userIsMjaSide = false;
      if (userCuerda) {
        const { data: cuerdaInfo } = await supabase
          .from('cuerdas')
          .select('is_church_cuerda')
          .eq('numero', userCuerda)
          .maybeSingle();
        userIsMjaSide = !!cuerdaInfo?.is_church_cuerda;

        // Single PostgREST .or() can't combine two paired conditions,
        // so we fire two counts and add. Cheap (HEAD requests).
        const baseQ = () => supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('numero_cuerda', userCuerda)
          .is('deleted_at', null);

        const [downQ, upQ] = await Promise.all([
          baseQ().not('received_from_mja_at', 'is', null).is('received_from_mja_seen_at', null),
          baseQ().not('sent_to_mja_at', 'is', null).is('sent_to_mja_seen_at', null),
        ]);
        mjaCount = (downQ.count || 0) + (upQ.count || 0);
      }

      // ── Unread messages in the last 24h. Same filter as NotificationBell.
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count: msgCount } = await supabase
        .from('message_recipients')
        .select('*, messages!inner(created_at)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .gte('messages.created_at', since);
      const unreadMessages = msgCount || 0;

      // Mark shown before firing so re-renders during the timeout don't
      // re-queue this work. If the actual toast call throws we'd rather
      // miss it for one session than spam it.
      try { sessionStorage.setItem(ssKey, '1'); } catch {}

      if (mjaCount > 0) {
        // Resolve church slug so the toast links to the friendly URL.
        // Falls back to UUID if the lookup fails — the layout redirects
        // UUID URLs to slug URLs anyway.
        const { data: churchRow } = await supabase
          .from('churches')
          .select('slug')
          .eq('id', churchId)
          .maybeSingle();
        const slugOrId = (churchRow as { slug: string } | null)?.slug || churchId;
        const semilleroPath = `/admin/churches/${slugOrId}/pool`;
        const headline = userIsMjaSide
          ? `Tenés ${mjaCount} ${mjaCount === 1 ? 'nuevo contacto recibido' : 'nuevos contactos recibidos'} de otras cuerdas`
          : `Tenés ${mjaCount} ${mjaCount === 1 ? 'nuevo contacto asignado' : 'nuevos contactos asignados'} por MJA`;
        const description = userIsMjaSide
          ? 'Abrí la solapa "Recibidos de MJA" en el Semillero para revisarlos.'
          : 'Abrí la solapa "Recibidos de MJA" en el Semillero para revisarlos.';
        showHighlight(headline, {
          description,
          action: {
            label: 'Ver',
            onClick: () => navigate(semilleroPath),
          },
        });
      }

      if (unreadMessages > 0) {
        showNotif(
          `Tenés ${unreadMessages} ${unreadMessages === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} sin leer`,
          {
            description: 'Mensajes recibidos en las últimas 24 horas.',
            action: {
              label: 'Ver',
              onClick: () => navigate('/admin/messages'),
            },
          },
        );
      }
    };

    // Tiny delay so the toast doesn't fire on the same tick as login —
    // gives the session settling time and feels more natural.
    const t = setTimeout(fire, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, profile?.church_id, profile?.numero_cuerda]);
}
