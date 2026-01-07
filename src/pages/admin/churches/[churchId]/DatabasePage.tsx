"use client";

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DynamicContactTable from '@/components/admin/DynamicContactTable';
import CsvImporter from '@/components/admin/CsvImporter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, PlusCircle, Upload, Filter } from 'lucide-react';
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

const ChurchDatabasePage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
  }

  const requiredContactFields = CONTACT_FIELDS.filter(f => f.key !== 'apartment_number' && f.key !== 'leader_assigned' && f.key !== 'created_at');
  const optionalContactFields = CONTACT_FIELDS.filter(f => f.key === 'apartment_number' || f.key === 'leader_assigned' || f.key === 'created_at');

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
            <DialogContent className="sm:max-w-[800px]">
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
            placeholder="Buscar contactos por nombre, correo, teléfono..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" /> Filtrar
        </Button>
      </div>

      <div className="flex-grow">
        <DynamicContactTable churchId={churchId} />
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