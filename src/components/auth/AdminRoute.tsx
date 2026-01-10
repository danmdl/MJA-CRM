import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { showError } from '@/utils/toast';

interface AdminRouteProps {
  children: React.ReactNode;
  requiredPermission?: keyof import('@/lib/permissions').PermissionData;
}

const AdminRoute = ({ children, requiredPermission }: AdminRouteProps) => {
  const { session, loading: sessionLoading, profile } = useSession();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!sessionLoading && session && !profile) {
      setLoadingProfile(true);
    } else {
      setLoadingProfile(false);
    }
  }, [session, sessionLoading, profile]);

  if (sessionLoading || loadingProfile || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has specific permission if required
  if (requiredPermission && !hasPermission(requiredPermission)) {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/" replace />;
  }

  // For admin routes, check if user can access admin section
  if (location.pathname.startsWith('/admin')) {
    const userRole = profile?.role;
    const isAdmin = userRole === 'admin';
    
    // Only admin, general, and church roles can access admin routes
    const isGeneral = userRole === 'general';
    const isChurchRole = ['pastor', 'reference', 'encargado_de_celula'].includes(userRole || '');
    
    if (!isAdmin && !isGeneral && !isChurchRole) {
      showError('No tienes permiso para acceder al panel de administración.');
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default AdminRoute;