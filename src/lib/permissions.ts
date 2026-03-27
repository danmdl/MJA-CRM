import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';

export interface PermissionData {
  role: string;
  see_all_churches: boolean;
  access_all_churches: boolean;
  add_users: boolean;
  edit_delete_users: boolean;
  see_all_analytics: boolean;
  see_own_church_analytics: boolean;
  change_user_role: boolean;
}

// Role hierarchy: higher index = higher privilege
const ROLE_HIERARCHY: string[] = ['user', 'encargado_de_celula', 'referente', 'pastor', 'general', 'admin'];

export const getRoleLevel = (role: string): number => {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? 0 : idx;
};

// Human-readable labels for all roles
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  general: 'General',
  pastor: 'Pastor',
  referente: 'Referente',
  encargado_de_celula: 'Líder de Célula',
  user: 'Usuario',
};

export const usePermissions = () => {
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const { data: permissions, isLoading } = useQuery<PermissionData[]>({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('role', { ascending: true });
      if (error) {
        console.error('Error loading permissions:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 0,              // Always re-fetch permissions (no cache)
    refetchOnWindowFocus: true, // Refresh when user switches back to this tab
    refetchInterval: 30_000,   // Also poll every 30s to catch admin changes
  });

  const getPermissionForRole = (role: string): PermissionData | undefined => {
    return permissions?.find(p => p.role === role);
  };

  const hasPermission = (permission: keyof PermissionData): boolean => {
    if (!profile?.role) return false;
    if (profile.role === 'admin') return true;
    const rolePermission = getPermissionForRole(profile.role);
    if (!rolePermission) return false;
    return Boolean(rolePermission[permission] || false);
  };

  const canSeeAllChurches = () => hasPermission('see_all_churches');
  const canAccessAllChurches = () => hasPermission('access_all_churches');
  const canAddUsers = () => hasPermission('add_users');
  const canEditDeleteUsers = () => hasPermission('edit_delete_users');
  const canSeeAllAnalytics = () => hasPermission('see_all_analytics');
  const canSeeOwnChurchAnalytics = () => hasPermission('see_own_church_analytics');
  const canChangeUserRole = () => hasPermission('change_user_role');

  // Only admin can access permissions management
  const canAccessPermissions = () => profile?.role === 'admin';

  // Check if current user can edit/delete a target user based on hierarchy
  const canManageUser = (targetRole: string): boolean => {
    if (!profile?.role) return false;
    if (profile.role === 'admin') return true;
    return getRoleLevel(profile.role) > getRoleLevel(targetRole);
  };

  return {
    permissions,
    isLoading,
    getPermissionForRole,
    hasPermission,
    canSeeAllChurches,
    canAccessAllChurches,
    canAddUsers,
    canEditDeleteUsers,
    canSeeAllAnalytics,
    canSeeOwnChurchAnalytics,
    canChangeUserRole,
    canAccessPermissions,
    canManageUser,
  };
};
