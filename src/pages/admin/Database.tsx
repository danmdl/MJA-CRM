import CsvImporter from '@/components/admin/CsvImporter';
import ContactTable from '@/components/admin/ContactTable'; // Importar el nuevo componente
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DatabasePage = () => {
  const contactFields = [
    { key: 'first_name', label: 'Primer Nombre', type: 'text' },
    { key: 'last_name', label: 'Apellido', type: 'text' },
    { key: 'email', label: 'Correo Electrónico', type: 'email' },
    { key: 'phone', label: 'Teléfono', type: 'phone' },
    { key: 'address', label: 'Dirección', type: 'text' },
    { key: 'apartment_number', label: 'Número de Apartamento', type: 'text' },
    { key: 'barrio', label: 'Barrio', type: 'text' },
    { key: 'leader_assigned', label: 'Líder Asignado', type: 'text' },
  ];

  const requiredContactFields = contactFields.filter(f => f.key !== 'apartment_number' && f.key !== 'leader_assigned');
  const optionalContactFields = contactFields.filter(f => f.key === 'apartment_number' || f.key === 'leader_assigned');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6">Gestión de Base de Datos</h1>
      <Tabs defaultValue="contacts" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contacts">Contactos</TabsTrigger>
          <TabsTrigger value="import-csv">Importar CSV</TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
          <ContactTable />
        </TabsContent>
        <TabsContent value="import-csv">
          <CsvImporter
            tableName="contacts"
            requiredFields={requiredContactFields}
            optionalFields={optionalContactFields}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DatabasePage;