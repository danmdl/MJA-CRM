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
  change_user_role: boolean; // New permission
}

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
  });

  const getPermissionForRole = (role: string): PermissionData | undefined => {
    return permissions?.find(p => p.role === role);
  };

  const hasPermission = (permission: keyof PermissionData): boolean => {
    if (!profile?.role) return false;
    
    // Admin always has all permissions
    if (profile.role === 'admin') return true;
    
    const rolePermission = getPermissionForRole(profile.role);
    if (!rolePermission) return false;
    
    return rolePermission[permission] || false;
  };

  const canSeeAllChurches = () => hasPermission('see_all_churches');
  const canAccessAllChurches = () => hasPermission('access_all_churches');
  const canAddUsers = () => hasPermission('add_users');
  const canEditDeleteUsers = () => hasPermission('edit_delete_users');
  const canSeeAllAnalytics = () => hasPermission('see_all_analytics');
  const canSeeOwnChurchAnalytics = () => hasPermission('see_own_church_analytics');
  const canChangeUserRole = () => hasPermission('change_user_role'); // New helper

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
    canChangeUserRole, // New helper
  };
};