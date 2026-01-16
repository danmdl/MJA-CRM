"use client";
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Key, Shield, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import UserTable from '@/components/admin/UserTable';
import ChurchUserTable from '@/components/admin/ChurchUserTable';
import InviteUserDialog from '@/components/admin/InviteUserDialog';
import CreateUserDialog from '@/components/admin/CreateUserDialog';
import { showError } from '@/utils/toast';

const LoginManagementPage = () => {
  const { profile } = useSession();
  const { canAddUsers, canEditDeleteUsers } = usePermissions();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  // If user doesn't have any user management permissions, show access denied
  if (!canAddUsers() && !canEditDeleteUsers()) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle className="text-xl">Acceso Restringido</CardTitle>
            <CardDescription>
              No tienes permisos para gestionar usuarios
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Para acceder a la gestión de usuarios, necesitas los siguientes permisos:
            </p>
            <div className="flex flex-col gap-2 text-left max-w-md mx-auto">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Agregar usuarios</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Editar/eliminar usuarios</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Contacta a un administrador si crees que deberías tener estos permisos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key className="h-8 w-8" />
            Gestión de Usuarios
          </h1>
          <p className="text-muted-foreground mt-2">
            Administra las cuentas de usuario del sistema
          </p>
        </div>
        {canAddUsers() && (
          <div className="flex gap-2">
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" type="button">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invitar Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invitar Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Envía una invitación por correo electrónico para que el usuario complete su registro.
                  </DialogDescription>
                </DialogHeader>
                <InviteUserDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} />
              </DialogContent>
            </Dialog>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Crear Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Crea manualmente una nueva cuenta de usuario con todos sus datos.
                  </DialogDescription>
                </DialogHeader>
                <CreateUserDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
      <div className="space-y-6">
        {canEditDeleteUsers() && (
          <Card>
            <CardHeader>
              <CardTitle>Usuarios del Sistema</CardTitle>
              <CardDescription>
                Todos los usuarios registrados en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserTable />
            </CardContent>
          </Card>
        )}
        {profile?.church_id && (
          <Card>
            <CardHeader>
              <CardTitle>Usuarios de tu Iglesia</CardTitle>
              <CardDescription>
                Usuarios asignados a tu iglesia
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChurchUserTable churchId={profile.church_id} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LoginManagementPage;