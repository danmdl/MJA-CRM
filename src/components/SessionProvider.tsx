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

    const getSessionAndProfile = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role, church_id')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          setProfile(null);
        } else {
          // Merge email from the auth session
          const fullProfile = {
            ...profileData,
            email: session.user.email ?? null,
          } as UserProfile;
          
          console.log('[DEBUG] loaded profile from DB:', fullProfile);
          setProfile(fullProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Re-fetch profile on auth state change (e.g., sign in/out, user update)
        getSessionAndProfile();
      } else {
        setProfile(null);
        setLoading(false); // Important: if session is null, loading should also be false
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