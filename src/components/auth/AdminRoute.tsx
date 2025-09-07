import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { showError } from '@/utils/toast';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
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
        <div>Verificando acceso...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const userRole = profile?.role;
  const isAdminOrGeneral = userRole === 'admin' || userRole === 'general';
  const isChurchRole = ['pastor', 'piloto', 'encargado_de_celula'].includes(userRole || '');

  // Paths that church roles can access under /admin
  const allowedChurchRolePaths = [
    '/admin/churches',
    '/admin/csv-deduplicator',
  ];

  // Check if the current path starts with any of the allowed church role paths
  const isCurrentPathAllowedForChurchRole = allowedChurchRolePaths.some(path => 
    location.pathname.startsWith(path)
  );

  if (isAdminOrGeneral) {
    // Admins and Generals have full access to all /admin routes
    return <>{children}</>;
  } else if (isChurchRole && isCurrentPathAllowedForChurchRole) {
    // Church roles can access specific /admin paths
    return <>{children}</>;
  } else {
    // For any other /admin path, or if not admin/general/church-role, deny access
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }
};

export default AdminRoute;