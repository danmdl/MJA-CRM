import { createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';

interface SessionContextType {
  session: Session | null;
  loading: boolean;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};