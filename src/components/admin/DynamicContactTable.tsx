"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTACT_FIELDS, ContactField } from '@/lib/contact-fields';
import { Checkbox } from '@/components/ui/checkbox';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  apartment_number: string | null;
  barrio: string | null;
  leader_assigned: string | null;
  created_at: string;
  church_id: string;
  cell_id: string | null;
}

const fetchContacts = async (churchId?: string): Promise<Contact[]> => {
  console.log(`[DynamicContactTable] fetchContacts called with churchId: ${churchId}`);
  let query = supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (churchId) {
    query = query.eq('church_id', churchId);
    console.log(`[DynamicContactTable] Filtering contacts by church_id: ${churchId}`);
  } else {
    console.warn("[DynamicContactTable] No churchId provided to fetchContacts. Fetching all contacts (if RLS allows).");
  }

  const { data, error } = await query;

  if (error) {
    console.error('[DynamicContactTable] Error fetching contacts:', error);
    throw new Error('No se pudieron cargar los contactos.');
  }
  console.log(`[DynamicContactTable] Successfully fetched ${data?.length || 0} contacts.`);
  return data || [];
};

interface DynamicContactTableProps {
  churchId?: string;
}

const DynamicContactTable = ({ churchId }: DynamicContactTableProps) => {
  const defaultVisibleColumns: ContactField[] = useMemo(() => [
    CONTACT_FIELDS.find(f => f.key === 'first_name')!,
    CONTACT_FIELDS.find(f => f.key === 'last_name')!,
    CONTACT_FIELDS.find(f => f.key === 'email')!,
    CONTACT_FIELDS.find(f => f.key === 'phone')!,
    CONTACT_FIELDS.find(f => f.key === 'address')!,
    CONTACT_FIELDS.find(f => f.key === 'apartment_number')!,
    CONTACT_FIELDS.find(f => f.key === 'barrio')!,
    CONTACT_FIELDS.find(f => f.key === 'leader_assigned')!,
    CONTACT_FIELDS.find(f => f.key === 'created_at')!,
  ].filter(Boolean), []);

  const [visibleColumns, setVisibleColumns] = useState<ContactField[]>(defaultVisibleColumns);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: contacts, isLoading, isError, error } = useQuery<Contact[]>({
    queryKey: ['contacts', churchId],
    queryFn: () => fetchContacts(churchId),
    enabled: !!churchId,
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      showSuccess('Contacto(s) eliminado(s) con éxito.');
      queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
      setSelectedContacts([]);
    },
    onError: (err) => {
      showError(err.message || 'Error al eliminar el contacto.');
    },
  });

  const handleColumnChange = (columnIndex: number, newFieldKey: string) => {
    const newField = CONTACT_FIELDS.find(f => f.key === newFieldKey);
    if (newField) {
      setVisibleColumns(prevColumns => {
        const updatedColumns = [...prevColumns];
        updatedColumns[columnIndex] = newField;
        return updatedColumns;
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedContacts.length === contacts?.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts?.map(c => c.id) || []);
    }
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedContacts.length === 0) return;
    if (window.confirm(`¿Estás seguro de que deseas eliminar ${selectedContacts.length} contacto(s)?`)) {
      selectedContacts.forEach(contactId => {
        deleteContactMutation.mutate(contactId);
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    console.error("[DynamicContactTable] Query error object:", error);
    showError(error?.message || 'Error al cargar los contactos.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los contactos.'}</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          <Checkbox
            checked={selectedContacts.length > 0 && selectedContacts.length === contacts?.length}
            indeterminate={selectedContacts.length > 0 && selectedContacts.length < contacts?.length}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedContacts.length} seleccionado(s)
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteSelected}
          disabled={selectedContacts.length === 0 || deleteContactMutation.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar Seleccionados
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedContacts.length > 0 && selectedContacts.length === contacts?.length}
                indeterminate={selectedContacts.length > 0 && selectedContacts.length < contacts?.length}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            {visibleColumns.map((column, index) => (
              <TableHead key={column.key + index}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-1 h-auto p-0 font-semibold text-foreground hover:text-primary">
                      {column.label} <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {CONTACT_FIELDS.map(field => (
                      <DropdownMenuItem
                        key={field.key}
                        onClick={() => handleColumnChange(index, field.key)}
                        disabled={visibleColumns.some(vc => vc.key === field.key)}
                      >
                        {field.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
            ))}
            <TableHead className="w-12">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts && contacts.length > 0 ? (
            contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedContacts.includes(contact.id)}
                    onCheckedChange={() => handleSelectContact(contact.id)}
                  />
                </TableCell>
                {visibleColumns.map((column) => (
                  <TableCell key={column.key}>
                    {column.type === 'date' && contact[column.key]
                      ? format(new Date(contact[column.key] as string), "d 'de' MMMM, yyyy", { locale: es })
                      : (contact[column.key] || '-')}
                  </TableCell>
                ))}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => deleteContactMutation.mutate(contact.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length + 2} className="text-center">
                No se encontraron contactos.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default DynamicContactTable;