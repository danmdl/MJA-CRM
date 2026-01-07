"use client";

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTACT_FIELDS, ContactField } from '@/lib/contact-fields';

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
  church_id: string; // Add church_id to Contact interface
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
  churchId?: string; // Make churchId optional
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
  ].filter(Boolean), []); // Filter out any undefined if a field is not found

  const [visibleColumns, setVisibleColumns] = useState<ContactField[]>(defaultVisibleColumns);

  const { data: contacts, isLoading, isError, error } = useQuery<Contact[]>({
    queryKey: ['contacts', churchId], // Include churchId in query key
    queryFn: () => fetchContacts(churchId),
    enabled: !!churchId, // Only enable query if churchId is available
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
    console.error("[DynamicContactTable] Query error object:", error); // Log the full error object
    showError(error?.message || 'Error al cargar los contactos.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los contactos.'}</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Checkbox for selection, if needed in the future */}
            <TableHead className="w-12">
              <input type="checkbox" className="form-checkbox" />
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
                        disabled={visibleColumns.some(vc => vc.key === field.key)} // Disable if already visible
                      >
                        {field.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts && contacts.length > 0 ? (
            contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <input type="checkbox" className="form-checkbox" />
                </TableCell>
                {visibleColumns.map((column) => (
                  <TableCell key={column.key}>
                    {column.type === 'date' && contact[column.key]
                      ? format(new Date(contact[column.key] as string), "d 'de' MMMM, yyyy", { locale: es })
                      : (contact[column.key] || '-')}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length + 1} className="text-center">
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