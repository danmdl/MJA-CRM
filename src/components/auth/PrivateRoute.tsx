import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { session, loading: sessionLoading } = useSession();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session) {
      setLoading(false);
      return;
    }

    const fetchUserRole = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        showError('No se pudo verificar tu rol de usuario.');
        setUserRole('user'); 
      } else if (data) {
        setUserRole(data.role);
      }
      setLoading(false);
    };

    fetchUserRole();
  }, [session, sessionLoading]);

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // If an admin or general user tries to access a non-admin route, redirect them to admin dashboard
  if (userRole === 'admin' || userRole === 'general') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;