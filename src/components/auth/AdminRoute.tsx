import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom'; // Importar Outlet
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

const AdminRoute = () => { // Ya no necesita el prop 'children'
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
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      console.log('AdminRoute - Resultado de la consulta de rol:', { data, error });

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

  return <Outlet />; // Renderizar Outlet para las rutas anidadas
};

export default AdminRoute;