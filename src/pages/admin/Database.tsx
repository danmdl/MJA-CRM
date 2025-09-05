import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Database as DatabaseIcon } from 'lucide-react';

const DatabasePage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Base de Datos</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="h-6 w-6" />
            Gestión de Base de Datos
          </CardTitle>
          <CardDescription>Esta sección está en construcción.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Aquí podrás ver y gestionar las tablas de tu base de datos en el futuro.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DatabasePage;