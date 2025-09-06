import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { session, loading: sessionLoading } = useSession();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session) {
      setLoading(false);
      return;
    }

    const checkAdminRole = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        showError('No se pudo verificar tu rol de usuario.');
        setHasAdminAccess(false);
      } else if (data && (data.role === 'admin' || data.role === 'general')) { // Allow 'admin' or 'general'
        setHasAdminAccess(true);
      } else {
        setHasAdminAccess(false);
      }
      setLoading(false);
    };

    checkAdminRole();
  }, [session, sessionLoading]);

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAdminAccess) {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;