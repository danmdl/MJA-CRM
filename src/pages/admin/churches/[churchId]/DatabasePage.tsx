"use client";

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DynamicContactTable from '@/components/admin/DynamicContactTable';
import CsvImporter from '@/components/admin/CsvImporter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, PlusCircle, Upload, Filter, X } from 'lucide-react';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AddContactDialog from '@/components/admin/AddContactDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const ChurchDatabasePage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [filterField, setFilterField] = useState<string | null>(null);

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  const requiredContactFields = CONTACT_FIELDS.filter(f => f.key === 'first_name');
  const optionalContactFields = CONTACT_FIELDS.filter(f => f.key !== 'first_name');

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterField(null);
  };

  const { data: totalCount } = useQuery({
    queryKey: ['contacts-count', churchId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId!);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contactos de la Iglesia</h1>
        <div className="flex space-x-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" /> Importar CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1100px]">
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
          <Button onClick={() => setIsAddContactDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Crear Contacto
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4 mb-4">
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
              <Filter className="mr-2 h-4 w-4" /> {filterField ? CONTACT_FIELDS.find(f => f.key === filterField)?.label : 'Filtrar'}
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
        {(searchTerm || filterField) && (
          <Button variant="ghost" onClick={handleClearFilters}>
            <X className="mr-2 h-4 w-4" /> Limpiar Filtros
          </Button>
        )}
      </div>

      {/* Put stats and the table inside the same relative container so the table's selection toolbar can position next to the cards */}
      <div className="relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-2">
          <Card className="flex items-center justify-between p-4">
            <div className="text-sm font-medium text-muted-foreground">Total contactos</div>
            <div className="text-2xl font-bold">{totalCount ?? 0}</div>
          </Card>
        </div>

        <div className="flex-grow">
          <DynamicContactTable
            churchId={churchId}
            searchTerm={searchTerm}
            filterField={filterField}
            useExternalToolbarContainer={true}
          />
        </div>
      </div>

      <AddContactDialog
        open={isAddContactDialogOpen}
        onOpenChange={setIsAddContactDialogOpen}
        churchId={churchId}
      />
    </div>
  );
};

export default ChurchDatabasePage;