"use client";
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import InviteUserDialog from '@/components/admin/InviteUserDialog';
import ChurchUserTable from '@/components/admin/ChurchUserTable';
import { usePermissions } from '@/lib/permissions';

const ChurchTeamPage = () => {
  const { churchId: churchSlug } = useParams<{ churchId: string }>();
  const churchId = useChurchUuid();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const { canAddMembers } = usePermissions();

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">Miembros de la Iglesia</CardTitle>
            <CardDescription>Ver, gestionar e invitar a miembros de esta iglesia.</CardDescription>
          </div>
          {canAddMembers() && (
            <Button onClick={() => setIsInviteDialogOpen(true)} className="shrink-0">
              <PlusCircle className="mr-2 h-4 w-4" />
              Invitar Miembro
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ChurchUserTable churchId={churchId} />
        </CardContent>
      </Card>
      <InviteUserDialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} churchId={churchId} />
    </div>
  );
};

export default ChurchTeamPage;
