import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import UserTable from '@/components/admin/UserTable';

const ManageTeam = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Equipo</h1>
        <Button disabled>
          <PlusCircle className="mr-2 h-4 w-4" /> Invitar Usuario
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Miembros del Equipo</CardTitle>
          <CardDescription>Ver, gestionar e invitar a miembros del equipo.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageTeam;