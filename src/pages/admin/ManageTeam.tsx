import Layout from '@/components/layout/Layout';
import { InviteUserDialog } from '@/components/admin/InviteUserDialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const ManageTeam = () => {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold mb-4">Gestionar Equipo</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Aquí puedes invitar nuevos miembros y gestionar los roles existentes.
        </p>
        <Button onClick={() => setIsInviteDialogOpen(true)}>Invitar Nuevo Miembro</Button>
        <InviteUserDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
        />
      </div>
    </Layout>
  );
};

export default ManageTeam;