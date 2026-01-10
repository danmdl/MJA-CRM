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
    '/admin/messages',
  ];

  const isCurrentPathAllowedForChurchRole = allowedChurchRolePaths.some(path =>
    location.pathname.startsWith(path)
  );

  if (isAdminOrGeneral) {
    return <>{children}</>;
  } else if (isChurchRole) {
    if (isCurrentPathAllowedForChurchRole) {
      return <>{children}</>;
    }
    // If a church-role user hits a disallowed admin path (like /admin or /admin/dashboard), redirect them to /admin/churches
    return <Navigate to="/admin/churches" replace />;
  } else {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }
};

export default AdminRoute;