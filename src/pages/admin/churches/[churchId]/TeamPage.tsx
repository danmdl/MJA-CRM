"use client";

import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import AddChurchMemberDialog from '@/components/admin/AddChurchMemberDialog';
import InviteChurchMemberDialog from '@/components/admin/InviteChurchMemberDialog';
import ChurchTeamTable from '@/components/admin/ChurchTeamTable';

const ChurchTeamPage = () => {
  const params = useParams();
  const churchId = params.churchId as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipo de la Iglesia</h1>
          <p className="text-muted-foreground">
            Gestioná la pertenencia y el rol de cada miembro de esta iglesia.
          </p>
        </div>
        {churchId && <AddChurchMemberDialog churchId={churchId} />}
        {churchId && <InviteChurchMemberDialog churchId={churchId} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Miembros</CardTitle>
          <CardDescription>Personas asignadas a esta iglesia</CardDescription>
        </CardHeader>
        <CardContent>
          {churchId ? (
            <ChurchTeamTable churchId={churchId} />
          ) : (
            <div className="text-red-500">Iglesia no encontrada.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChurchTeamPage;