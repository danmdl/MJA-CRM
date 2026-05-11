import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showInfo } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

// Daily reminder: if the user has contacts sitting in their MJA outbox
// (pending_external_send=true) waiting for confirmation, show a toast
// once per day nudging them to confirm or send back to the seedling.
//
// "Once per day" is tracked in localStorage with a per-user key, so
// the same user doesn't get nagged twice in one day and different users
// on the same device get their own counters.
//
// Why this matters: pending-send contacts are invisible to everyone
// else until confirmed — a forgotten outbox = forgotten contacts.

const LS_KEY_PREFIX = 'mja.outboxReminder.lastShown.';

export function useOutboxReminder() {
  const { session, profile } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !profile?.church_id) return;

    // MJA Central members don't have an outbox to send — they receive.
    // Skip the reminder for them.
    // (We can't easily tell here if they're MJA without joining cuerdas,
    // so we just check the role: admin/general don't get this reminder.)
    if (profile.role === 'admin' || profile.role === 'general') return;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const lsKey = `${LS_KEY_PREFIX}${userId}`;
    const lastShown = (() => { try { return localStorage.getItem(lsKey); } catch { return null; } })();
    if (lastShown === today) return; // already shown today

    // Query count of pending outbox contacts for this user. We don't
    // load the contacts themselves — just COUNT for speed.
    const fire = async () => {
      const userCuerda = profile.numero_cuerda;
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', profile.church_id!)
        .eq('pending_external_send', true)
        .is('cell_id', null)
        .is('deleted_at', null);

      // Same filter the SemilleroPage applies to determine "your" outbox:
      // if the user has a cuerda, scope by numero_cuerda; otherwise
      // scope by created_by/responsable.
      if (userCuerda) {
        query = query.eq('numero_cuerda', userCuerda);
      } else {
        query = query.or(`created_by.eq.${userId},responsable_id.eq.${userId}`);
      }

      const { count, error } = await query;
      if (error || !count || count <= 0) {
        // Even if 0, mark as "shown today" so we don't re-run the query
        // every time the user navigates around. Cheap insurance.
        try { localStorage.setItem(lsKey, today); } catch {}
        return;
      }

      showInfo(
        `Tenés ${count} contacto${count === 1 ? '' : 's'} en tu outbox de MJA esperando confirmación. ` +
        `Recordá confirmarlos o devolverlos al semillero.`,
      );

      // Mark as shown for today
      try { localStorage.setItem(lsKey, today); } catch {}

      // Bonus: clicking the toast would be nice, but our toast lib
      // doesn't support that here. The user can navigate manually.
      void navigate; // keep import warm; future use
    };

    // Tiny delay so we don't fire on the exact same tick as login —
    // gives the session settling time and feels more natural.
    const t = setTimeout(fire, 2500);
    return () => clearTimeout(t);
  }, [session?.user?.id, profile?.church_id, profile?.role, profile?.numero_cuerda, navigate]);
}
