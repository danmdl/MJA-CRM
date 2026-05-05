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

  // Check if any cell's leader_name matches this profile's name and auto-assign.
  // No confirmation prompt — if Mauro Avalos is logged in and Mauro Avalos is the
  // leader_name on a cell, he IS that leader. Edge case of two people with the
  // same name in the same church is rare enough to handle manually.
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

      for (const cell of cells) {
        if (!cell.leader_name) continue;
        const cellLeader = normalize(cell.leader_name);
        // Match: full name matches, or first name matches when leader_name is a single word
        if (cellLeader === profileName || (cellLeader === profileFirst && !cellLeader.includes(' '))) {
          // Auto-assign: link the cell directly to this user
          await supabase.from('cells').update({ encargado_id: profileId }).eq('id', cell.id);
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
          const search = window.location.search;
          const fullUrl = hash + search;
          const isInviteLink = fullUrl.includes('type=invite') || fullUrl.includes('type=signup') || fullUrl.includes('type=recovery') || search.includes('code=');
          if (isInviteLink && !profileData.profile_completed) {
            setNeedsPasswordSetup(true);
          }
          // Also catch users who have a session but never set a password
          // (they clicked the invite link and Supabase auto-logged them in
          // via PKCE without going through the hash flow)
          if (!profileData.profile_completed && currentSession) {
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

    let lastLoggedUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Silently refresh profile without showing loading screen
        fetchProfile(session);
        // Log login event — but only for genuinely new logins, not token refreshes.
        // Supabase fires SIGNED_IN both on real login AND on token refresh (every hour).
        // Track the last logged user_id and only insert if it's a different user or
        // first login of this session.
        if (_event === 'SIGNED_IN' && lastLoggedUserId !== session.user.id) {
          lastLoggedUserId = session.user.id;
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
        lastLoggedUserId = null;
        // If user was signed out (session expired, manual logout, etc.)
        // redirect to login to prevent stale UI
        if (_event === 'SIGNED_OUT') {
          window.location.href = '/login';
        }
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