import { useContext } from 'react';
import { Session } from '@supabase/supabase-js';

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

export const useSession = (): SessionContextType => {
  const context = useContext(require('@/components/SessionProvider').SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};