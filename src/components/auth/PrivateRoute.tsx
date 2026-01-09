import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { session, loading: sessionLoading, profile } = useSession();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!sessionLoading && session && !profile) {
      setLoadingProfile(true);
    } else {
      setLoadingProfile(false);
    }
  }, [session, sessionLoading, profile]);

  if (sessionLoading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // If admin/general lands on a non-admin path, send them to the admin dashboard
  if ((profile?.role === 'admin' || profile?.role === 'general') && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Allow all other roles (pastor, piloto, encargado_de_celula, user) to access user pages
  return <>{children}</>;
};

export default PrivateRoute;