import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom'; // No longer needs Outlet here
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import AdminLayout from '@/components/layout/AdminLayout'; // Import AdminLayout

const AdminRoute = () => { // No longer takes children prop
  const { session, loading: sessionLoading } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
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
        setIsAdmin(false);
      } else if (data && data.role === 'admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
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

  if (!isAdmin) {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }

  // If admin, render the AdminLayout which will then render its children via Outlet
  return <AdminLayout />;
};

export default AdminRoute;