import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const AdminDashboard = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard de Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>¡Bienvenido, Admin!</CardTitle>
          <CardDescription>Este es tu centro de control para gestionar la aplicación.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Desde aquí, puedes gestionar usuarios, ver analíticas y configurar ajustes. Usa la barra lateral para navegar por las diferentes secciones.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;