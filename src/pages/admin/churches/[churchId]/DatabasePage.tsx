"use client";
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DynamicContactTable from '@/components/admin/DynamicContactTable';
import CsvImporter from '@/components/admin/CsvImporter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, PlusCircle, Upload, Filter, X, Download, Users } from 'lucide-react';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import AddContactDialog from '@/components/admin/AddContactDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/permissions';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

const exportContactsToCSV = async (churchId: string) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('first_name, last_name, phone, address, apartment_number, barrio, numero_cuerda, zona, leader_assigned, conector, fecha_contacto, date_of_birth, edad, sexo, estado_civil, observaciones, pedido_de_oracion, created_at')
    .eq('church_id', churchId)
    .order('first_name', { ascending: true });

  if (error || !data) {
    showError('No se pudo exportar los contactos.');
    return;
  }

  const headers = [
    'Nombre', 'Apellido', 'Teléfono', 'Dirección',
    'Departamento', 'Barrio', 'N° Cuerda', 'Zona', 'Referente asignado', 'Conector',
    'Fecha de Contacto', 'Fecha de nacimiento', 'Edad', 'Sexo',
    'Estado Civil', 'Observaciones', 'Pedido de Oración', 'Creado en'
  ];

  const escape = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = data.map(c => [
    escape(c.first_name),
    escape(c.last_name),
    escape(c.phone),
    escape(c.address),
    escape(c.apartment_number),
    escape(c.barrio),
    escape(c.numero_cuerda),
    escape(c.zona),
    escape(c.leader_assigned),
    escape(c.conector),
    c.fecha_contacto ? escape(c.fecha_contacto) : '',
    c.date_of_birth ? escape(c.date_of_birth.split('T')[0]) : '',
    escape(c.edad),
    escape(c.sexo),
    escape(c.estado_civil),
    escape(c.observaciones),
    escape(c.pedido_de_oracion),
    c.created_at ? escape(new Date(c.created_at).toLocaleDateString('es-AR')) : '',
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contactos-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(`${data.length} contactos exportados.`);
};

const ChurchDatabasePage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [filterField, setFilterField] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ageGroupFilter, setAgeGroupFilter] = useState<string | null>(null);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const { canAddUsers, canEditDeleteUsers } = usePermissions();
  const { profile } = useSession();
  // Contacts permissions - separate from team member permissions
  // Connectors can always add contacts (that's their job)
  // Anyone with access can add contacts; edit/delete requires permission OR being a connector
  const canAddContacts = () => canAddUsers() || profile?.role === 'user';
  const canEditContacts = () => canEditDeleteUsers() || profile?.role === 'user';

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  const handleExport = async () => {
    setExporting(true);
    await exportContactsToCSV(churchId);
    setExporting(false);
  };

  const requiredContactFields = CONTACT_FIELDS.filter(f => f.key === 'first_name');
  const optionalContactFields = CONTACT_FIELDS.filter(f => f.key !== 'first_name');

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Contactos de la Iglesia</h1>
          <div id="selection-toolbar-slot" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting} size="sm">
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          {canAddContacts() && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsCsvDialogOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                Importar CSV
              </Button>
              <Dialog open={isCsvDialogOpen} onOpenChange={setIsCsvDialogOpen}>
                <DialogContent className="sm:max-w-[1200px] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Importar Contactos desde CSV</DialogTitle>
                    <DialogDescription>
                      Sube un archivo CSV para añadir nuevos contactos a la base de datos de esta iglesia.
                    </DialogDescription>
                  </DialogHeader>
                  <CsvImporter
                    tableName="contacts"
                    requiredFields={requiredContactFields}
                    optionalFields={optionalContactFields}
                    churchId={churchId}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}
          {canAddContacts() && (
            <Button onClick={() => setIsAddContactDialogOpen(true)} size="sm">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              Crear Contacto
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4 mb-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={filterField ? `Filtrar por ${CONTACT_FIELDS.find(f => f.key === filterField)?.label}...` : "Buscar por nombre, teléfono, dirección, referente, etc."}
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              {filterField ? CONTACT_FIELDS.find(f => f.key === filterField)?.label : 'Filtrar'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {CONTACT_FIELDS.map(field => (
              <DropdownMenuItem key={field.key} onClick={() => setFilterField(field.key)}>
                {field.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={ageGroup ? 'default' : 'outline'}>
              <Users className="mr-2 h-4 w-4" />
              {ageGroup || 'Grupo Etario'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {[null, 'Niño', 'Adolescente', 'Joven', 'Joven Adulto', 'Adulto', 'Crecer'].map(g => (
              <DropdownMenuItem key={g ?? 'all'} onClick={() => setAgeGroup(g)}>
                {g === null ? 'Todos' : g}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {(searchTerm || filterField || ageGroup) && (
          <Button variant="ghost" onClick={() => { setSearchTerm(''); setFilterField(null); setAgeGroup(null); }}>
            <X className="mr-2 h-4 w-4" />
            Limpiar Filtros
          </Button>
        )}
      </div>

      <DynamicContactTable
        churchId={churchId}
        searchTerm={searchTerm}
        filterField={filterField}
        ageGroup={ageGroup}
        useExternalToolbarContainer={true}
        canEdit={canEditContacts()}
        canDelete={canEditContacts()}
        canAdd={canAddContacts()}
      />

      <AddContactDialog
        open={isAddContactDialogOpen}
        onOpenChange={setIsAddContactDialogOpen}
        churchId={churchId}
      />
    </div>
  );
};

export default ChurchDatabasePage;
