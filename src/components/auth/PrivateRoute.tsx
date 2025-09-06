import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

const PrivateRoute = () => {
  const { session, loading: sessionLoading } = useSession();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    if (sessionLoading || !session) {
      setLoadingRole(false);
      return;
    }

    const fetchUserRole = async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user role in PrivateRoute:', error);
        showError('No se pudo verificar tu rol de usuario.');
        setUserRole('user'); // Default to user on error
      } else if (data) {
        setUserRole(data.role);
      } else {
        setUserRole('user'); // Default if no profile found
      }
      setLoadingRole(false);
    };

    fetchUserRole();
  }, [session, sessionLoading]);

  if (sessionLoading || loadingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  // If the user is an admin, redirect them to the admin dashboard.
  // AppContent handles unauthenticated users and onboarding.
  if (userRole === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // If not an admin, allow access to the nested user routes.
  return <Outlet />;
};

export default PrivateRoute;