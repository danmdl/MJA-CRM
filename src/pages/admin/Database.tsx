import CsvImporter from '@/components/admin/CsvImporter';

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

  // Para este ejemplo, todos los campos serán requeridos para simplificar.
  // Puedes separar en requiredFields y optionalFields según necesites.
  const requiredContactFields = contactFields.filter(f => f.key !== 'apartment_number' && f.key !== 'leader_assigned');
  const optionalContactFields = contactFields.filter(f => f.key === 'apartment_number' || f.key === 'leader_assigned');


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6">Gestión de Base de Datos</h1>
      <CsvImporter
        tableName="contacts"
        requiredFields={requiredContactFields}
        optionalFields={optionalContactFields}
      />
    </div>
  );
};

export default DatabasePage;