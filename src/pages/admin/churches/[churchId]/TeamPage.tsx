"use client";

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';

const ChurchTeamPage = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipo de la Iglesia</h1>
          <p className="text-muted-foreground">
            La gestión de usuarios fue removida; administrá permisos por rol desde la sección de Permisos.
          </p>
        </div>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Ir a: <a href="/admin/permissions" className="text-primary underline">Admin → Permisos</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChurchTeamPage;