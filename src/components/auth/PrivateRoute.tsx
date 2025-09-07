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
      // If session exists but profile is not loaded yet, wait for it
      // This might happen if profile fetching is slightly delayed
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

  // Redirect admin/general to admin dashboard
  if (profile?.role === 'admin' || profile?.role === 'general') {
    // If they are already on an admin path, let them continue
    if (location.pathname.startsWith('/admin')) {
      return <>{children}</>;
    }
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Redirect pastor/piloto/encargado_de_celula to admin churches page
  if (['pastor', 'piloto', 'encargado_de_celula'].includes(profile?.role || '')) {
    // If they are already on an admin path (churches or csv-deduplicator), let them continue
    if (location.pathname.startsWith('/admin/churches') || location.pathname === '/admin/csv-deduplicator') {
      return <>{children}</>;
    }
    // If they are on the root or a user-specific page, redirect to admin churches
    return <Navigate to="/admin/churches" replace />;
  }

  // For 'user' role, or if no specific redirection, render children
  return <>{children}</>;
};

export default PrivateRoute;