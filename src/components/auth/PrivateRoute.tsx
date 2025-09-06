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
      // Si no hay sesión o aún está cargando, OnboardingGuard ya debería haber manejado esto.
      // Este caso idealmente no debería ocurrir si OnboardingGuard funciona correctamente.
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
        setUserRole('user'); // Por defecto a 'user' en caso de error
      } else if (data) {
        setUserRole(data.role);
      } else {
        setUserRole('user'); // Por defecto si no se encuentra perfil
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

  // Si el usuario es un administrador, redirigirlo al dashboard de administrador.
  // OnboardingGuard ya asegura que la sesión esté activa y el onboarding completo.
  if (userRole === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Si no es administrador, permitir el acceso a las rutas anidadas de usuario.
  return <Outlet />;
};

export default PrivateRoute;