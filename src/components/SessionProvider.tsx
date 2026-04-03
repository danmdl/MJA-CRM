import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { SessionContext } from '@/hooks/use-session';
import { RoleKey } from '@/lib/roles';

// Definir la interfaz para el perfil del usuario
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: RoleKey;
  church_id: string | null;
}

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  const clearPasswordSetup = () => setNeedsPasswordSetup(false);

  useEffect(() => {
    // Detect invite link: Supabase puts type=invite in the URL hash
    const hash = window.location.hash;
    if (hash.includes('type=invite') || hash.includes('type=signup') || hash.includes('type=recovery')) {
      setNeedsPasswordSetup(true);
    }

    let isInitialLoad = true;

    const fetchProfile = async (currentSession: Session | null) => {
      if (currentSession) {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role, church_id, numero_cuerda')
          .eq('id', currentSession.user.id)
          .single();

        if (!error && profileData) {
          const fullProfile = {
            ...profileData,
            email: currentSession.user.email ?? null,
          } as UserProfile;
          setProfile(fullProfile);
        } else {
          console.error('Error fetching profile:', error);
          if (isInitialLoad) setProfile(null);
        }
      } else {
        setProfile(null);
      }
    };

    const getSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      await fetchProfile(session);
      setLoading(false);
      isInitialLoad = false;
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Silently refresh profile without showing loading screen
        fetchProfile(session);
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