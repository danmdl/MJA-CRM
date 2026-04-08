import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { SessionContext } from '@/hooks/use-session';
import { RoleKey } from '@/lib/roles';
import { normalize } from '@/lib/normalize';

// Definir la interfaz para el perfil del usuario
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: RoleKey;
  church_id: string | null;
  numero_cuerda: string | null;
  profile_completed: boolean;
}

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  const clearPasswordSetup = () => {
    setNeedsPasswordSetup(false);
    // Strip the invite/recovery hash from the URL so refreshing the page
    // doesn't reopen the onboarding screen.
    if (typeof window !== 'undefined' && window.location.hash) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch { /* ignore */ }
    }
  };

  // Check if any cell's leader_name matches this profile's name
  const checkLeaderMatches = async (profileId: string, firstName: string, lastName: string | null, churchId: string) => {
    try {
      // Get cells with leader_name for this church that don't have an encargado yet
      const { data: cells } = await supabase
        .from('cells')
        .select('id, leader_name')
        .eq('church_id', churchId)
        .is('encargado_id', null)
        .not('leader_name', 'is', null);

      if (!cells?.length) return;

      const profileName = normalize(`${firstName} ${lastName || ''}`);
      const profileFirst = normalize(firstName);

      // Check for existing pending matches to avoid duplicates
      const { data: existing } = await supabase
        .from('pending_leader_matches')
        .select('cell_id')
        .eq('profile_id', profileId);
      const existingCellIds = new Set((existing || []).map(e => e.cell_id));

      for (const cell of cells) {
        if (!cell.leader_name || existingCellIds.has(cell.id)) continue;
        const cellLeader = normalize(cell.leader_name);
        // Match: full name matches, or first name matches when leader_name is a single word
        if (cellLeader === profileName || (cellLeader === profileFirst && !cellLeader.includes(' '))) {
          await supabase.from('pending_leader_matches').insert({
            profile_id: profileId,
            cell_id: cell.id,
            matched_name: cell.leader_name,
            status: 'pending',
          });
        }
      }
    } catch { /* silent — don't break login flow */ }
  };

  useEffect(() => {
    // Note: invite-link detection now lives inside fetchProfile so we can also
    // check whether the user has already completed onboarding (profile_completed).
    // Re-clicking an old invite link no longer reopens the password-setup screen.

    let isInitialLoad = true;

    const fetchProfile = async (currentSession: Session | null) => {
      if (currentSession) {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role, church_id, numero_cuerda, profile_completed')
          .eq('id', currentSession.user.id)
          .single();

        if (!error && profileData) {
          const fullProfile = {
            ...profileData,
            email: currentSession.user.email ?? null,
          } as UserProfile;
          setProfile(fullProfile);

          // Detect users who arrived via an invite/recovery link AND haven't
          // completed onboarding yet. We do NOT want to show the password-setup
          // screen to a user who has already finished onboarding and is just
          // re-clicking an old invite link from their inbox - that was the
          // backdoor that let them keep changing their password.
          const hash = window.location.hash;
          const isInviteLink = hash.includes('type=invite') || hash.includes('type=signup') || hash.includes('type=recovery');
          if (isInviteLink && !profileData.profile_completed) {
            setNeedsPasswordSetup(true);
          }

          // Check for leader name matches (runs silently in background)
          if (profileData.first_name && profileData.church_id) {
            checkLeaderMatches(profileData.id, profileData.first_name, profileData.last_name, profileData.church_id);
          }
        } else {
          console.error('Error fetching profile:', error);
          if (isInitialLoad) setProfile(null);
        }
      } else {
        setProfile(null);
      }
    };

    const getSessionAndProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        await fetchProfile(session);
      } catch (err) {
        console.error('Error initializing session:', err);
        setSession(null);
        setProfile(null);
      } finally {
        setLoading(false);
        isInitialLoad = false;
      }
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Silently refresh profile without showing loading screen
        fetchProfile(session);
        // Log login event
        if (_event === 'SIGNED_IN') {
          supabase.from('activity_logs').insert({
            user_id: session.user.id,
            church_id: null,
            action: 'login',
            entity_type: 'auth',
            entity_id: session.user.id,
          }).then(() => {});
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    loading,
    profile,
    needsPasswordSetup,
    clearPasswordSetup,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};