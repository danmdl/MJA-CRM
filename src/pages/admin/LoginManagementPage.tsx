"use client";

import React from 'react';
import UserTable from '@/components/admin/UserTable'; // Reusing the existing UserTable component

const LoginManagementPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Gestión de Usuarios</h1>
      <p className="text-muted-foreground mb-6">
        Administra todos los usuarios registrados en la plataforma, sus roles y asignaciones de iglesia.
      </p>
      <UserTable />
    </div>
  );
};

export default LoginManagementPage;