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
  add_members: boolean;
  add_contacts: boolean;
  edit_delete_contacts: boolean;
  edit_delete_members: boolean;
  base_datos_total: boolean;
  can_see_base_datos: boolean;
  can_see_pool: boolean;
  can_edit_cuerda: boolean;
  can_see_celulas: boolean;
  can_edit_celulas: boolean;
  can_see_historial: boolean;
  can_send_messages: boolean;
  can_restore_deleted: boolean;
  can_import_csv: boolean;
  can_assign_contacts: boolean;
  can_see_cuerdas: boolean;
  can_edit_cuerdas: boolean;
}

// Role hierarchy: higher index = higher privilege
const ROLE_HIERARCHY: string[] = ['anfitrion', 'conector', 'encargado_de_celula', 'referente', 'supervisor', 'pastor', 'general', 'admin'];

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
  conector: 'Conector',
  supervisor: 'Supervisor',
  anfitrion: 'Anfitrión',
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
    refetchInterval: 30_000,   // Poll every 30s to catch admin changes
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
  const canAddMembers = () => hasPermission('add_members');
  const canAddContacts = () => hasPermission('add_contacts');
  const canEditDeleteContacts = () => hasPermission('edit_delete_contacts');
  const canEditDeleteMembers = () => hasPermission('edit_delete_members');
  const canSeeBaseDatosTotal = () => hasPermission('base_datos_total');
  const canSeeBaseDatos = () => hasPermission('can_see_base_datos');
  const canSeePool = () => hasPermission('can_see_pool');
  const canEditCuerda = () => hasPermission('can_edit_cuerda');
  const canSeeCelulas = () => hasPermission('can_see_celulas');
  const canEditCelulas = () => hasPermission('can_edit_celulas');
  const canSeeHistorial = () => hasPermission('can_see_historial');
  const canSendMessages = () => hasPermission('can_send_messages');
  const canRestoreDeleted = () => hasPermission('can_restore_deleted');
  const canImportCsv = () => hasPermission('can_import_csv');
  const canAssignContacts = () => hasPermission('can_assign_contacts');
  const canSeeCuerdas = () => hasPermission('can_see_cuerdas');
  const canEditCuerdas = () => hasPermission('can_edit_cuerdas');

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
    canAddMembers,
    canAddContacts,
    canEditDeleteContacts,
    canEditDeleteMembers,
    canSeeBaseDatosTotal,
    canSeeBaseDatos,
    canSeePool,
    canEditCuerda,
    canSeeCelulas,
    canEditCelulas,
    canSeeHistorial,
    canSendMessages,
    canRestoreDeleted,
    canImportCsv,
    canAssignContacts,
    canSeeCuerdas,
    canEditCuerdas,
    canAccessPermissions,
    canManageUser,
  };
};
