import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { showError } from '@/utils/toast';
import { logger } from '@/utils/logger'; // Import the logger utility

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
    logger.log('[AdminRoute] Session or profile loading...');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso...</div>
      </div>
    );
  }

  if (!session) {
    logger.warn('[AdminRoute] No session found, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  const userRole = profile?.role;
  const isAdminOrGeneral = userRole === 'admin' || userRole === 'general';
  const isChurchRole = ['pastor', 'piloto', 'encargado_de_celula'].includes(userRole || '');

  logger.log(`[AdminRoute] User Role: ${userRole}, Path: ${location.pathname}`);
  logger.log(`[AdminRoute] isAdminOrGeneral: ${isAdminOrGeneral}, isChurchRole: ${isChurchRole}`);

  // Paths that church roles can access under /admin
  const allowedChurchRolePaths = [
    '/admin/churches',
    '/admin/csv-deduplicator',
    '/admin/messages',
  ];

  const isCurrentPathAllowedForChurchRole = allowedChurchRolePaths.some(path =>
    location.pathname.startsWith(path)
  );
  logger.log(`[AdminRoute] isCurrentPathAllowedForChurchRole: ${isCurrentPathAllowedForChurchRole}`);

  if (isAdminOrGeneral) {
    logger.log('[AdminRoute] Admin/General user, allowing access.');
    return <>{children}</>;
  } else if (isChurchRole) {
    if (isCurrentPathAllowedForChurchRole) {
      logger.log('[AdminRoute] Church role user, path allowed, allowing access.');
      return <>{children}</>;
    }
    // If a church-role user hits a disallowed admin path (like /admin or /admin/dashboard), redirect them to /admin/churches
    logger.warn('[AdminRoute] Church role user, path not allowed, redirecting to /admin/churches');
    return <Navigate to="/admin/churches" replace />;
  } else {
    logger.error(`[AdminRoute] User role ${userRole} has no permission for admin paths, redirecting to /`);
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }
};

export default AdminRoute;