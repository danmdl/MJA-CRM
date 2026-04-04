"use client";
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DynamicContactTable from '@/components/admin/DynamicContactTable';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, PlusCircle, Filter, X, Download, Users } from 'lucide-react';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AddContactDialog from '@/components/admin/AddContactDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/permissions';
import { useSession } from '@/hooks/use-session';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useQuery } from '@tanstack/react-query';
import DuplicateDetectorPanel from '@/components/admin/DuplicateDetectorPanel';

const exportContactsToCSV = async (churchId: string) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('first_name, last_name, phone, address, apartment_number, barrio, numero_cuerda, zona, leader_assigned, conector, fecha_contacto, date_of_birth, edad, sexo, estado_civil, estado_seguimiento, observaciones, pedido_de_oracion, created_at')
    .eq('church_id', churchId)
    .order('first_name', { ascending: true });

  if (error || !data) {
    showError('No se pudo exportar los contactos.');
    return;
  }

  const headers = [
    'Nombre', 'Apellido', 'Teléfono', 'Dirección',
    'Departamento', 'Barrio', 'N° Cuerda', 'Zona', 'Líder de Célula', 'Conector',
    'Fecha de Contacto', 'Fecha de nacimiento', 'Edad', 'Sexo',
    'Estado Civil', 'Seguimiento', 'Observaciones', 'Pedido de Oración', 'Creado en'
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
  const { canAddContacts, canEditDeleteContacts, canSeeBaseDatosTotal } = usePermissions();
  const { profile } = useSession();

  const isGlobalRole = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor';

  // Cuerda filter
  const userCuerdaNumero = profile?.numero_cuerda || null;
  const canSeeAll = canSeeBaseDatosTotal() || isGlobalRole || profile?.role === 'supervisor';
  const [cuerdaFilter, setCuerdaFilter] = useState<string | null>(canSeeAll ? null : userCuerdaNumero);

  // Fetch available cuerdas for the filter dropdown
  const { data: availableCuerdas } = useQuery<string[]>({
    queryKey: ['cuerda-numbers', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('numero_cuerda').eq('church_id', churchId!).not('numero_cuerda', 'is', null);
      const unique = [...new Set((data || []).map((c: any) => c.numero_cuerda).filter(Boolean))].sort();
      return unique as string[];
    },
    enabled: !!churchId && canSeeAll,
  });

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  const handleExport = async () => {
    setExporting(true);
    await exportContactsToCSV(churchId);
    setExporting(false);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {canSeeAll ? 'Datos Globales' : `Datos Globales — Cuerda ${userCuerdaNumero || ''}`}
          </h1>
          <div id="selection-toolbar-slot" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting} size="sm">
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          <DuplicateDetectorPanel churchId={churchId!} />
          {isGlobalRole && (
            <Button onClick={() => setIsAddContactDialogOpen(true)} size="sm">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              Crear Contacto
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4 mb-0">
        {/* Cuerda filter */}
        {!canSeeAll && userCuerdaNumero ? (
          <Badge className="bg-primary/15 text-primary text-sm px-3 py-1.5 flex-shrink-0">
            Cuerda {userCuerdaNumero}
          </Badge>
        ) : canSeeAll ? (
          <Select value={cuerdaFilter || '__all__'} onValueChange={v => setCuerdaFilter(v === '__all__' ? null : v)}>
            <SelectTrigger className="w-[140px] h-9 flex-shrink-0">
              <SelectValue placeholder="Todas las cuerdas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las cuerdas</SelectItem>
              {(availableCuerdas || []).map(num => (
                <SelectItem key={num} value={num}>Cuerda {num}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
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
        {(searchTerm || filterField || ageGroup || cuerdaFilter) && (
          <Button variant="ghost" onClick={() => { setSearchTerm(''); setFilterField(null); setAgeGroup(null); if (canSeeAll) setCuerdaFilter(null); }}>
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
        cuerdaFilter={canSeeAll ? cuerdaFilter : userCuerdaNumero}
        useExternalToolbarContainer={true}
        canEdit={canEditDeleteContacts()}
        canDelete={canEditDeleteContacts()}
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
