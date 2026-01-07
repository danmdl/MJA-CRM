"use client";

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import { InviteUserDialog } from '@/components/admin/InviteUserDialog';
import ChurchUserTable from '@/components/admin/ChurchUserTable';

const ChurchTeamPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Equipo de la Iglesia</h1>
        <Button onClick={() => setIsInviteDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Invitar Miembro
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Miembros de la Iglesia</CardTitle>
          <CardDescription>Ver, gestionar e invitar a miembros de esta iglesia.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChurchUserTable churchId={churchId} />
        </CardContent>
      </Card>
      <InviteUserDialog 
        open={isInviteDialogOpen} 
        onOpenChange={setIsInviteDialogOpen} 
        churchId={churchId} 
      />
    </div>
  );
};

export default ChurchTeamPage;