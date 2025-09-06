import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

const AdminRoute = () => {
  const { session, loading: sessionLoading } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    if (sessionLoading || !session) {
      setLoadingRole(false);
      return;
    }

    const checkAdminRole = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user role in AdminRoute:', error);
        showError('No se pudo verificar tu rol de administrador.');
        setIsAdmin(false);
      } else if (data && data.role === 'admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setLoadingRole(false);
    };

    checkAdminRole();
  }, [session, sessionLoading]);

  if (sessionLoading || loadingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso...</div>
      </div>
    );
  }

  // If the user is not an admin, redirect them to the regular user dashboard.
  // AppRoutes handles unauthenticated users and onboarding.
  if (!isAdmin) {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }

  // If admin, allow access to the nested admin routes.
  return <Outlet />;
};

export default AdminRoute;