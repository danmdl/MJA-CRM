"use client";
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Shield, Users, Building, BarChart, UserPlus, Edit, Eye } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { getRoleLabel, isReferenceRole } from '@/lib/roles';

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
  };
}

const defaultPermissions: PermissionConfig[] = [
  {
    role: 'admin',
    label: 'Admin',
    permissions: {
      seeAllChurches: true,
      accessAllChurches: true,
      addUsers: true,
      editDeleteUsers: true,
      seeAllAnalytics: true,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'general',
    label: 'General',
    permissions: {
      seeAllChurches: true,
      accessAllChurches: true,
      addUsers: true,
      editDeleteUsers: true,
      seeAllAnalytics: true,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'pastor',
    label: 'Pastor',
    permissions: {
      seeAllChurches: false,
      accessAllChurches: false,
      addUsers: false,
      editDeleteUsers: false,
      seeAllAnalytics: false,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'piloto',
    label: 'Piloto (Legacy)',
    permissions: {
      seeAllChurches: false,
      accessAllChurches: false,
      addUsers: false,
      editDeleteUsers: false,
      seeAllAnalytics: false,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'reference',
    label: 'Referente',
    permissions: {
      seeAllChurches: false,
      accessAllChurches: false,
      addUsers: false,
      editDeleteUsers: false,
      seeAllAnalytics: false,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'encargado_de_celula',
    label: 'Encargado de Célula',
    permissions: {
      seeAllChurches: false,
      accessAllChurches: false,
      addUsers: false,
      editDeleteUsers: false,
      seeAllAnalytics: false,
      seeOwnChurchAnalytics: true,
    },
  },
  {
    role: 'user',
    label: 'Usuario',
    permissions: {
      seeAllChurches: false,
      accessAllChurches: false,
      addUsers: false,
      editDeleteUsers: false,
      seeAllAnalytics: false,
      seeOwnChurchAnalytics: false,
    },
  },
];

const PermissionsDashboard = () => {
  const [permissions, setPermissions] = useState<PermissionConfig[]>(defaultPermissions);
  const [isSaving, setIsSaving] = useState(false);
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
    { key: 'seeAllChurches', label: 'Ver todas las iglesias', icon: Eye },
    { key: 'accessAllChurches', label: 'Acceder a todas las iglesias', icon: Building },
    { key: 'addUsers', label: 'Agregar usuarios', icon: UserPlus },
    { key: 'editDeleteUsers', label: 'Editar/eliminar usuarios', icon: Edit },
    { key: 'seeAllAnalytics', label: 'Ver todas las analíticas', icon: BarChart },
    { key: 'seeOwnChurchAnalytics', label: 'Ver analíticas de mi iglesia', icon: BarChart },
  ] as const;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Panel de Permisos</h1>
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
          <div className="space-y-6">
            {/* Header row with permission labels */}
            <div className="grid grid-cols-7 gap-4 font-medium text-sm text-muted-foreground">
              <div>Rol</div>
              {permissionColumns.map((column) => (
                <div key={column.key} className="text-center">
                  <column.icon className="h-4 w-4 mx-auto mb-1" />
                  {column.label}
                </div>
              ))}
            </div>

            {/* Permission rows for each role */}
            {permissions.map((config, roleIndex) => (
              <div key={config.role} className="grid grid-cols-7 gap-4 items-center">
                <div className="font-medium">
                  <Badge variant={config.role === 'admin' ? 'default' : 'secondary'}>
                    {config.label}
                  </Badge>
                  {config.role === 'piloto' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Usuarios existentes mantendrán este rol
                    </div>
                  )}
                </div>
                {permissionColumns.map((column) => (
                  <div key={column.key} className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-12 h-12 p-0"
                      onClick={() => updatePermission(roleIndex, column.key as keyof PermissionConfig['permissions'])}
                      disabled={config.role === 'admin' && config.permissions[column.key as keyof PermissionConfig['permissions']]}
                    >
                      {config.permissions[column.key as keyof PermissionConfig['permissions']] ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ))}
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
                <li>• <strong>Referente:</strong> Nuevo rol de referencia (reemplaza Piloto)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Roles Adicionales:</h4>
              <ul className="text-sm space-y-1">
                <li>• <strong>Piloto:</strong> Rol legacy para usuarios existentes</li>
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