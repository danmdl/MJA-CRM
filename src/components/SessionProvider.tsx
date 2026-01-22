"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

// Definir la interfaz para el perfil del usuario
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: UserRole;
  church_id: string | null;
}

interface SessionContextType {
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  user: { id: string; email?: string | null } | null;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Escuchar cambios en la sesión de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);

      if (newSession) {
        setTimeout(async () => {
          const { data: fetchedProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .single();

          if (profileError) {
            console.error('[SessionProvider] Error fetching profile:', profileError);
          }

          setProfile(fetchedProfile || null);
          queryClient.invalidateQueries({ queryKey: ['session'] });
        }, 0);
      } else {
        setProfile(null);
        queryClient.invalidateQueries({ queryKey: ['session'] });
      }
    });

    // Obtener la sesión inicial
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setLoading(false);

      if (initialSession) {
        setTimeout(async () => {
          const { data: fetchedProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', initialSession.user.id)
            .single();

          if (profileError) {
            console.error('[SessionProvider] Error fetching profile:', profileError);
          }

          setProfile(fetchedProfile || null);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [queryClient]);

  const contextValue: SessionContextType = {
    session,
    loading,
    profile,
    user: session ? { id: session.user.id, email: session.user.email || null } : null,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
};