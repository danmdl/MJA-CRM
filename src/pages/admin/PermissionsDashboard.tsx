"use client";
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Shield, Users, Building, BarChart, UserPlus, Edit, Eye, UserCog, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface PermissionConfig {
  role: string;
  label: string;
  permissions: {
    seeAllChurches: boolean;
    accessAllChurches: boolean;
    addUsers: boolean;
    editDeleteUsers: boolean;
    seeAllAnalytics: boolean;
    seeOwnChurchAnalytics: boolean;
    changeUserRole: boolean;
    addMembers: boolean;
    addContacts: boolean;
    editDeleteContacts: boolean;
    editDeleteMembers: boolean;
    baseDatosTotal: boolean;
    canSeeBaseDatos: boolean;
    canSeePool: boolean;
    canEditCuerda: boolean;
    canSeeCelulas: boolean;
    canEditCelulas: boolean;
    canSeeHistorial: boolean;
    canSendMessages: boolean;
    canRestoreDeleted: boolean;
    canImportCsv: boolean;
    canAssignContacts: boolean;
    canSeeCuerdas: boolean;
    canEditCuerdas: boolean;
  };
}

const defaultPermissions: PermissionConfig[] = [
  {
    role: 'admin', label: 'Admin',
    permissions: { seeAllChurches: true, accessAllChurches: true, addUsers: true, editDeleteUsers: true, addMembers: true, addContacts: true, editDeleteContacts: true, editDeleteMembers: true, seeAllAnalytics: true, seeOwnChurchAnalytics: true, changeUserRole: true, baseDatosTotal: true, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: true, canSeeCelulas: true, canEditCelulas: true, canSeeHistorial: true, canSendMessages: true, canRestoreDeleted: true, canImportCsv: true, canAssignContacts: true, canSeeCuerdas: true, canEditCuerdas: true },
  },
  {
    role: 'general', label: 'General',
    permissions: { seeAllChurches: true, accessAllChurches: true, addUsers: true, editDeleteUsers: true, addMembers: true, addContacts: true, editDeleteContacts: true, editDeleteMembers: true, seeAllAnalytics: true, seeOwnChurchAnalytics: true, changeUserRole: true, baseDatosTotal: true, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: true, canSeeCelulas: true, canEditCelulas: true, canSeeHistorial: true, canSendMessages: true, canRestoreDeleted: true, canImportCsv: true, canAssignContacts: true, canSeeCuerdas: true, canEditCuerdas: true },
  },
  {
    role: 'pastor', label: 'Pastor',
    permissions: { seeAllChurches: false, accessAllChurches: false, addUsers: false, editDeleteUsers: false, seeAllAnalytics: false, seeOwnChurchAnalytics: true, changeUserRole: false, addMembers: false, addContacts: true, editDeleteContacts: false, editDeleteMembers: false, baseDatosTotal: true, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: true, canSeeCelulas: true, canEditCelulas: true, canSeeHistorial: true, canSendMessages: true, canRestoreDeleted: true, canImportCsv: true, canAssignContacts: true, canSeeCuerdas: true, canEditCuerdas: true },
  },
  {
    role: 'supervisor', label: 'Supervisor',
    permissions: { seeAllChurches: false, accessAllChurches: false, addUsers: false, editDeleteUsers: false, seeAllAnalytics: false, seeOwnChurchAnalytics: true, changeUserRole: false, addMembers: false, addContacts: true, editDeleteContacts: true, editDeleteMembers: false, baseDatosTotal: false, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: false, canSeeCelulas: true, canEditCelulas: true, canSeeHistorial: true, canSendMessages: true, canRestoreDeleted: false, canImportCsv: false, canAssignContacts: false, canSeeCuerdas: true, canEditCuerdas: false },
  },
  {
    role: 'referente', label: 'Referente',
    permissions: { seeAllChurches: false, accessAllChurches: false, addUsers: false, editDeleteUsers: false, seeAllAnalytics: false, seeOwnChurchAnalytics: true, changeUserRole: false, addMembers: false, addContacts: true, editDeleteContacts: false, editDeleteMembers: false, baseDatosTotal: false, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: false, canSeeCelulas: true, canEditCelulas: false, canSeeHistorial: true, canSendMessages: true, canRestoreDeleted: false, canImportCsv: false, canAssignContacts: false, canSeeCuerdas: true, canEditCuerdas: false },
  },
  {
    role: 'encargado_de_celula', label: 'Líder de Célula',
    permissions: { seeAllChurches: false, accessAllChurches: false, addUsers: false, editDeleteUsers: false, seeAllAnalytics: false, seeOwnChurchAnalytics: true, changeUserRole: false, addMembers: false, addContacts: true, editDeleteContacts: false, editDeleteMembers: false, baseDatosTotal: false, canSeeBaseDatos: true, canSeePool: true, canEditCuerda: false, canSeeCelulas: true, canEditCelulas: false, canSeeHistorial: false, canSendMessages: true, canRestoreDeleted: false, canImportCsv: false, canAssignContacts: false, canSeeCuerdas: false, canEditCuerdas: false },
  },
  {
    role: 'conector', label: 'Conector',
    permissions: { seeAllChurches: false, accessAllChurches: false, addUsers: false, editDeleteUsers: false, seeAllAnalytics: false, seeOwnChurchAnalytics: false, changeUserRole: false, addMembers: false, addContacts: true, editDeleteContacts: false, editDeleteMembers: false, baseDatosTotal: false, canSeeBaseDatos: false, canSeePool: true, canEditCuerda: false, canSeeCelulas: false, canEditCelulas: false, canSeeHistorial: false, canSendMessages: true, canRestoreDeleted: false, canImportCsv: false, canAssignContacts: false, canSeeCuerdas: false, canEditCuerdas: false },
  },
];

const PermissionsDashboard = () => {
  const [permissions, setPermissions] = useState<PermissionConfig[]>(defaultPermissions);
  const [isSaving, setIsSaving] = useState(false);
  const [permSearch, setPermSearch] = useState('');
  const queryClient = useQueryClient();

  // Load permissions from database
  const { data: savedPermissions, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('role', { ascending: true });
      
      if (error) {
        console.error('Error loading permissions:', error);
        return null;
      }
      
      return data;
    },
  });

  // Update local state when data loads
  React.useEffect(() => {
    if (savedPermissions && savedPermissions.length > 0) {
      const loadedPermissions = defaultPermissions.map(defaultConfig => {
        const savedConfig = savedPermissions.find(p => p.role === defaultConfig.role);
        if (savedConfig) {
          return {
            ...defaultConfig,
            permissions: {
              seeAllChurches: savedConfig.see_all_churches,
              accessAllChurches: savedConfig.access_all_churches,
              addUsers: savedConfig.add_users,
              editDeleteUsers: savedConfig.edit_delete_users,
              seeAllAnalytics: savedConfig.see_all_analytics,
              seeOwnChurchAnalytics: savedConfig.see_own_church_analytics,
              changeUserRole: savedConfig.change_user_role,
              addMembers: savedConfig.add_members ?? false,
              addContacts: savedConfig.add_contacts ?? true,
              editDeleteContacts: savedConfig.edit_delete_contacts ?? false,
              editDeleteMembers: savedConfig.edit_delete_members ?? false,
              baseDatosTotal: savedConfig.base_datos_total ?? false,
              canSeeBaseDatos: savedConfig.can_see_base_datos ?? true,
              canSeePool: savedConfig.can_see_pool ?? true,
              canEditCuerda: savedConfig.can_edit_cuerda ?? false,
              canSeeCelulas: savedConfig.can_see_celulas ?? false,
              canEditCelulas: savedConfig.can_edit_celulas ?? false,
              canSeeHistorial: savedConfig.can_see_historial ?? false,
              canSendMessages: savedConfig.can_send_messages ?? true,
              canRestoreDeleted: savedConfig.can_restore_deleted ?? false,
              canImportCsv: savedConfig.can_import_csv ?? false,
              canAssignContacts: savedConfig.can_assign_contacts ?? false,
              canSeeCuerdas: savedConfig.can_see_cuerdas ?? false,
              canEditCuerdas: savedConfig.can_edit_cuerdas ?? false,
            },
          };
        }
        return defaultConfig;
      });
      setPermissions(loadedPermissions);
    }
  }, [savedPermissions]);

  const updatePermission = (roleIndex: number, permission: keyof PermissionConfig['permissions']) => {
    setPermissions(prev => 
      prev.map((config, index) => 
        index === roleIndex 
          ? {
              ...config,
              permissions: {
                ...config.permissions,
                [permission]: !config.permissions[permission],
              },
            }
          : config
      )
    );
  };

  const savePermissions = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('permissions')
        .upsert(
          permissions.map(config => ({
            role: config.role,
            see_all_churches: config.permissions.seeAllChurches,
            access_all_churches: config.permissions.accessAllChurches,
            add_users: config.permissions.addUsers,
            edit_delete_users: config.permissions.editDeleteUsers,
            see_all_analytics: config.permissions.seeAllAnalytics,
            see_own_church_analytics: config.permissions.seeOwnChurchAnalytics,
            change_user_role: config.permissions.changeUserRole,
            add_members: config.permissions.addMembers,
            add_contacts: config.permissions.addContacts,
            edit_delete_contacts: config.permissions.editDeleteContacts,
            edit_delete_members: config.permissions.editDeleteMembers,
            base_datos_total: config.permissions.baseDatosTotal,
            can_see_base_datos: config.permissions.canSeeBaseDatos,
            can_see_pool: config.permissions.canSeePool,
            can_edit_cuerda: config.permissions.canEditCuerda,
            can_see_celulas: config.permissions.canSeeCelulas,
            can_edit_celulas: config.permissions.canEditCelulas,
            can_see_historial: config.permissions.canSeeHistorial,
            can_send_messages: config.permissions.canSendMessages,
            can_restore_deleted: config.permissions.canRestoreDeleted,
            can_import_csv: config.permissions.canImportCsv,
            can_assign_contacts: config.permissions.canAssignContacts,
            can_see_cuerdas: config.permissions.canSeeCuerdas,
            can_edit_cuerdas: config.permissions.canEditCuerdas,
          })),
          { onConflict: 'role' }
        );

      if (error) {
        throw error;
      }

      showSuccess('Permisos guardados exitosamente');
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
    } catch (error) {
      console.error('Error saving permissions:', error);
      showError('Error al guardar los permisos');
    } finally {
      setIsSaving(false);
    }
  };

  const permissionColumns = [
    // Solapas visibles
    { key: 'canSeePool', label: 'Ver solapa Semillero', icon: Eye },
    { key: 'canSeeBaseDatos', label: 'Ver solapa Datos Globales', icon: Eye },
    { key: 'canSeeCelulas', label: 'Ver solapa Células', icon: Eye },
    { key: 'canEditCelulas', label: 'Editar células', icon: Edit },
    { key: 'canSeeHistorial', label: 'Ver Historial de actividad', icon: Eye },
    { key: 'canSendMessages', label: 'Enviar mensajes internos', icon: Edit },
    { key: 'canRestoreDeleted', label: 'Restaurar de la Papelera', icon: Edit },
    { key: 'canImportCsv', label: 'Importar contactos por CSV', icon: Edit },
    { key: 'canAssignContacts', label: 'Asignar contactos a células/cuerdas', icon: Edit },
    { key: 'canSeeCuerdas', label: 'Ver solapa Cuerdas', icon: Edit },
    { key: 'canEditCuerdas', label: 'Editar cuerdas (agregar células, etc.)', icon: Edit },
    { key: 'seeOwnChurchAnalytics', label: 'Ver Resumen / Equipo / Cuerdas / Mapa', icon: BarChart },
    // Contactos
    { key: 'addContacts', label: 'Crear contactos (en Semillero)', icon: UserPlus },
    { key: 'editDeleteContacts', label: 'Editar/eliminar contactos', icon: Edit },
    { key: 'canEditCuerda', label: 'Editar número de cuerda', icon: Edit },
    { key: 'baseDatosTotal', label: 'Ver todas las cuerdas en Datos Globales', icon: Eye },
    // Equipo
    { key: 'addMembers', label: 'Agregar miembro al equipo', icon: UserPlus },
    { key: 'editDeleteMembers', label: 'Editar/eliminar miembro del equipo', icon: Edit },
    { key: 'changeUserRole', label: 'Cambiar rol de miembro', icon: UserCog },
    // Global (admin)
    { key: 'seeAllChurches', label: 'Ver todas las iglesias', icon: Eye },
    { key: 'accessAllChurches', label: 'Acceder a todas las iglesias', icon: Building },
    { key: 'seeAllAnalytics', label: 'Ver analíticas globales', icon: BarChart },
    { key: 'addUsers', label: 'Invitar miembros al equipo', icon: UserPlus },
    { key: 'editDeleteUsers', label: 'Eliminar miembros del equipo', icon: Edit },
  ] as const;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold">Panel de Permisos</h1>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Panel de Permisos
          </h1>
          <p className="text-muted-foreground mt-2">
            Configura los permisos de acceso para cada rol en el sistema
          </p>
        </div>
        <Button onClick={savePermissions} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar Permisos'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de Permisos por Rol</CardTitle>
          <CardDescription>
            Marca las casillas para permitir que cada rol realice acciones específicas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Buscar permisos..." value={permSearch} onChange={e => setPermSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted-foreground pb-4 pr-4 min-w-[120px]">Rol</th>
                  {permissionColumns.filter(c => !permSearch || c.label.toLowerCase().includes(permSearch.toLowerCase())).map((column) => (
                    <th key={column.key} className="text-center font-medium text-muted-foreground pb-4 px-2 min-w-[90px]">
                      <column.icon className="h-4 w-4 mx-auto mb-1" />
                      <span className="block leading-tight">{column.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
            {/* Permission rows for each role */}
            {permissions.map((config, roleIndex) => (
              <tr key={config.role}>
                <td className="py-3 pr-4">
                  <Badge variant={config.role === 'admin' ? 'default' : 'secondary'}>
                    {config.label}
                  </Badge>
                </td>
                {permissionColumns.filter(c => !permSearch || c.label.toLowerCase().includes(permSearch.toLowerCase())).map((column) => (
                  <td key={column.key} className="text-center py-3 px-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-10 h-10 p-0 mx-auto"
                      onClick={() => updatePermission(roleIndex, column.key as keyof PermissionConfig['permissions'])}
                      disabled={config.role === 'admin' && config.permissions[column.key as keyof PermissionConfig['permissions']]}
                    >
                      {config.permissions[column.key as keyof PermissionConfig['permissions']] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información de Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Roles Activos:</h4>
              <ul className="text-sm space-y-1">
                <li>• <strong>Admin:</strong> Acceso completo al sistema</li>
                <li>• <strong>General:</strong> Acceso administrativo extendido</li>
                <li>• <strong>Pastor:</strong> Gestión de su propia iglesia</li>
                <li>• <strong>Referente:</strong> Rol de referencia</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Roles Adicionales:</h4>
              <ul className="text-sm space-y-1">
                <li>• <strong>Encargado de Célula:</strong> Gestión de células</li>
                <li>• <strong>Usuario:</strong> Acceso básico limitado</li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Permiso concedido</span>
            </div>
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-600" />
              <span className="text-sm">Permiso denegado</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default">Admin</Badge>
              <span className="text-sm">El rol Admin siempre tiene todos los permisos</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PermissionsDashboard;