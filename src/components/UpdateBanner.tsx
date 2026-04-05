import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { X, Sparkles } from 'lucide-react';

interface ChangelogEntry {
  id: string;
  title: string;
  description: string | null;
  importance: number;
  published_at: string;
}

const VISIBLE_ROLES = ['admin', 'general', 'pastor', 'supervisor', 'referente'];

const UpdateBanner = () => {
  const { session, profile } = useSession();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [dismissed, setDismissed] = useState(true);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || !profile?.role) { setLoading(false); return; }
    if (!VISIBLE_ROLES.includes(profile.role)) { setLoading(false); return; }

    const load = async () => {
      // Find the most recent day that has changelog entries
      const { data: latestEntries } = await supabase
        .from('changelog')
        .select('id, title, description, importance, published_at')
        .order('published_at', { ascending: false })
        .order('importance', { ascending: false })
        .limit(20);

      if (!latestEntries?.length) { setLoading(false); return; }

      // Group by date, find the latest date
      const latestDate = latestEntries[0].published_at;

      // Check if user already dismissed this date
      const { data: dismissals } = await supabase
        .from('changelog_dismissed')
        .select('id')
        .eq('user_id', userId)
        .eq('dismissed_date', latestDate);

      if (dismissals && dismissals.length > 0) { setLoading(false); return; }

      // Get top 3 from that date by importance
      const dayEntries = latestEntries
        .filter(e => e.published_at === latestDate)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3);

      setEntries(dayEntries);
      setDismissed(false);
      setLoading(false);
    };

    load();
  }, [userId, profile?.role]);

  const handleDismiss = async () => {
    setDismissed(true);
    if (entries.length > 0 && userId) {
      await supabase.from('changelog_dismissed').insert({
        user_id: userId,
        dismissed_date: entries[0].published_at,
      });
    }
  };

  if (loading || dismissed || entries.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200,
      width: '92%',
      maxWidth: 620,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: '1px solid rgba(255, 194, 51, 0.3)',
        borderRadius: 14,
        padding: '20px 24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles style={{ width: 20, height: 20, color: '#FFC233' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFC233' }}>Novedades del sistema</span>
          </div>
          <button onClick={handleDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 16, height: 16, color: '#71717a' }} />
          </button>
        </div>

        {/* Entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(255, 194, 51, 0.15)',
                color: '#FFC233',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2,
              }}>{i + 1}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', margin: 0 }}>{e.title}</p>
                {e.description && <p style={{ fontSize: 12, color: '#a1a1aa', margin: '3px 0 0', lineHeight: 1.5 }}>{e.description}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a
            href="/admin/notifications"
            style={{ fontSize: 12, color: '#FFC233', textDecoration: 'none', fontWeight: 500 }}
            onClick={handleDismiss}
          >
            Ver todas las novedades →
          </a>
          <button
            onClick={handleDismiss}
            style={{
              fontSize: 10, color: '#71717a', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
              padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateBanner;
