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
  const { hasPermission, permissionsReady, canSeeAllChurches } = usePermissions();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!sessionLoading && session && !profile) {
      setLoadingProfile(true);
    } else {
      setLoadingProfile(false);
    }
  }, [session, sessionLoading, profile]);

  // permissionsReady is the SINGLE flag that says "profile + permissions
  // are both available, so any decision based on hasPermission/canX is
  // safe to make now". Earlier this guard checked permissionsLoading
  // alone, which only covered half of the race — if the permissions
  // query returned but the profile hadn't, hasPermission(...) would
  // still answer false during the gap, and the guard could redirect
  // to /login on a permission check that should have passed. Wait for
  // the unified flag instead.
  if (sessionLoading || loadingProfile || (session && !permissionsReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has specific permission if required.
  // Send them to /login (not /) because /admin and /admin/anything would
  // re-trigger this same guard and infinite-loop.
  if (requiredPermission && !hasPermission(requiredPermission)) {
    showError('No tienes permiso para acceder a esta página.');
    return <Navigate to="/login" replace />;
  }

  // For admin routes: any authenticated user with ANY permission can access admin section.
  // Users with zero permissions are sent to /login.
  // 'consolidador' was added to the role hierarchy and must be included here too,
  // otherwise consolidadores would be locked out of /admin entirely.
  if (location.pathname.startsWith('/admin')) {
    const userRole = profile?.role;
    const isChurchRole = ['pastor', 'referente', 'gestor_de_cuerda', 'encargado_de_celula', 'consolidador', 'conector', 'supervisor', 'anfitrion'].includes(userRole || '');
    const hasBroadAccess = canSeeAllChurches();

    if (!hasBroadAccess && !isChurchRole) {
      showError('No tienes permiso para acceder al panel de administración.');
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};

export default AdminRoute;