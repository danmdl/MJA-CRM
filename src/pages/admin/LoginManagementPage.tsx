"use client";

import React, { useState } from 'react';
import UserTable from '@/components/admin/UserTable';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog'; // Import the new dialog
import { useSession } from '@/hooks/use-session'; // Import useSession

const LoginManagementPage = () => {
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const { profile } = useSession(); // Get user profile

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="p-6"> {/* Added p-6 here */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
        {isAdmin && ( // Only show Create User button for admin
          <Button onClick={() => setIsCreateUserDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Crear Usuario
          </Button>
        )}
      </div>
      <p className="text-muted-foreground mb-6">
        Administra todos los usuarios registrados en la plataforma, sus roles y asignaciones de iglesia.
      </p>
      <UserTable />

      <CreateUserDialog
        open={isCreateUserDialogOpen}
        onOpenChange={setIsCreateUserDialogOpen}
      />
    </div>
  );
};

export default LoginManagementPage;