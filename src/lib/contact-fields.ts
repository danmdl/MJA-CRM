export const CONTACT_FIELDS = [
  { key: 'first_name', label: 'Nombre', type: 'text' },
  { key: 'last_name', label: 'Apellido', type: 'text' },
  { key: 'phone', label: 'Teléfono', type: 'phone' },
  { key: 'address', label: 'Dirección', type: 'text' },
  { key: 'apartment_number', label: 'Departamento', type: 'text' },
  { key: 'barrio', label: 'Barrio', type: 'text' },
  { key: 'leader_assigned', label: 'Referente asignado', type: 'text' },
  { key: 'conector', label: 'Conector', type: 'text' },
  { key: 'fecha_contacto', label: 'Fecha de Contacto', type: 'date' },
  { key: 'date_of_birth', label: 'Fecha de nacimiento', type: 'date' },
  { key: 'sexo', label: 'Sexo', type: 'text' },
  { key: 'estado_civil', label: 'Estado Civil', type: 'text' },
  { key: 'observaciones', label: 'Observaciones', type: 'text' },
  { key: 'pedido_de_oracion', label: 'Pedido de Oración', type: 'text' },
  { key: 'created_at', label: 'Creado en', type: 'date' },
];

export type ContactField = typeof CONTACT_FIELDS[number];
