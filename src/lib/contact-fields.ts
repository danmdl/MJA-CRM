export const CONTACT_FIELDS = [
  { key: 'first_name', label: 'Nombre', type: 'text' },
  { key: 'last_name', label: 'Apellido', type: 'text' },
  { key: 'email', label: 'Correo Electrónico', type: 'email' },
  { key: 'phone', label: 'Teléfono', type: 'phone' },
  { key: 'address', label: 'Dirección', type: 'text' },
  { key: 'apartment_number', label: 'Departamento', type: 'text' },
  { key: 'barrio', label: 'Barrio', type: 'text' },
  { key: 'leader_assigned', label: 'Referente asignado', type: 'text' },
  { key: 'created_at', label: 'Fecha de Creación', type: 'date' },
];

export type ContactField = typeof CONTACT_FIELDS[number];