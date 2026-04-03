import { createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'conector' | 'supervisor' | 'anfitrion';

// Definir la interfaz para el perfil del usuario
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null; // Added email to UserProfile
  role: UserRole;
  church_id: string | null;
}

interface SessionContextType {
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  needsPasswordSetup: boolean;
  clearPasswordSetup: () => void;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};