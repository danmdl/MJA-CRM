"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, Trash2, Edit, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTACT_FIELDS, ContactField } from '@/lib/contact-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { logger } from '@/utils/logger';
import ContactProfileDialog from './ContactProfileDialog';

// Interfaces
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
  last_contact_date?: string | null;
  cell?: {
    name: string;
  } | null;
  leader?: {
    first_name: string;
    last_name: string;
  } | null;
}

// Componentes modulares
const TableHeaderCell = ({
  column,
  index,
  visibleColumns,
  extendedContactFields,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleColumnChange
}: {
  column: ContactField;
  index: number;
  visibleColumns: ContactField[];
  extendedContactFields: ContactField[];
  handleDragStart: (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => void;
  handleDragOver: (e: React.DragEvent<HTMLTableHeaderCellElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLTableHeaderCellElement>, dropIndex: number) => void;
  handleColumnChange: (columnIndex: number, newFieldKey: string) => void;
}) => (
  <TableHead
    key={column.key + index}
    draggable
    onDragStart={(e) => handleDragStart(e, index)}
    onDragOver={handleDragOver}
    onDrop={(e) => handleDrop(e, index)}
    className={`cursor-move ${column.key === 'apartment_number' ? 'w-24' : ''} ${column.key === 'last_contact_date' ? 'w-32' : ''}`}
  >
    <div className="flex items-center gap-1">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-1 h-auto p-0 font-semibold text-foreground hover:text-primary">
            {column.label}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {extendedContactFields.map(field => (
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
    </div>
  </TableHead>
);

const TableCellContent = ({
  contact,
  column,
  selectedContacts,
  handleSelectContact,
  handleViewProfile
}: {
  contact: Contact;
  column: ContactField;
  selectedContacts: string[];
  handleSelectContact: (contactId: string) => void;
  handleViewProfile: (contactId: string) => void;
}) => {
  const formatCompactDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "d/MM/yy", { locale: es });
    } catch (e) {
      return dateString;
    }
  };

  const truncateText = (text: string | null, maxLength: number = 30) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <TableCell
      className={`align-top max-w-xs truncate ${column.key === 'first_name' || column.key === 'last_name' ? "cursor-pointer hover:underline" : ""}`}
      onClick={() => {
        if (column.key === 'first_name' || column.key === 'last_name') {
          handleViewProfile(contact.id);
        }
      }}
      title={contact[column.key] || undefined}
    >
      {column.key === 'created_at' || column.key === 'last_contact_date' ? (
        contact[column.key] ?
          formatCompactDate(contact[column.key] as string) :
          '-'
      ) : column.key === 'cell.name' ? (
        contact.cell?.name || '-'
      ) : column.key === 'leader.first_name' ? (
        contact.leader ?
          `${contact.leader.first_name} ${contact.leader.last_name}` :
          '-'
      ) : (
        truncateText(contact[column.key] as string)
      )}
    </TableCell>
  );
};

const SelectionToolbar = ({
  selectedContacts,
  handleEditContact,
  handleDeleteSelected,
  deleteContactMutation
}: {
  selectedContacts: string[];
  handleEditContact: (contactId: string) => void;
  handleDeleteSelected: () => void;
  deleteContactMutation: any;
}) => (
  <div className="flex items-center justify-between p-3 bg-muted rounded-md">
    <div className="text-sm text-muted-foreground">
      {selectedContacts.length} contacto(s) seleccionado(s)
    </div>
    <div className="flex space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleEditContact(selectedContacts[0])}
        disabled={selectedContacts.length !== 1}
      >
        <Edit className="mr-2 h-4 w-4" />
        Editar
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDeleteSelected}
        disabled={deleteContactMutation.isPending}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Eliminar Seleccionados
      </Button>
    </div>
  </div>
);

// Componente principal
const DynamicContactTable = ({ churchId }: { churchId?: string }) => {
  logger.log('[DynamicContactTable] Component rendered', { churchId });

  // Add cell and leader to the fields
  const extendedContactFields = useMemo(() => [
    ...CONTACT_FIELDS,
    { key: 'cell.name', label: 'Célula', type: 'text' },
    { key: 'leader.first_name', label: 'Líder Asignado', type: 'text' },
    { key: 'last_contact_date', label: 'Último Contacto', type: 'date' }
  ], []);

  const defaultVisibleColumns: ContactField[] = useMemo(() => [
    extendedContactFields.find(f => f.key === 'first_name')!,
    extendedContactFields.find(f => f.key === 'last_name')!,
    extendedContactFields.find(f => f.key === 'email')!,
    extendedContactFields.find(f => f.key === 'phone')!,
    extendedContactFields.find(f => f.key === 'cell.name')!,
    extendedContactFields.find(f => f.key === 'leader.first_name')!,
    extendedContactFields.find(f => f.key === 'last_contact_date')!,
    extendedContactFields.find(f => f.key === 'created_at')!,
  ].filter(Boolean), [extendedContactFields]);

  const [visibleColumns, setVisibleColumns] = useState<ContactField[]>(defaultVisibleColumns);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [profileContactId, setProfileContactId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fetchContacts = async (churchId?: string): Promise<Contact[]> => {
    logger.log('[DynamicContactTable] fetchContacts called with churchId', churchId);

    // First, fetch contacts
    let contactQuery = supabase
      .from('contacts')
      .select(`
        *,
        latest_log:contact_logs(contact_date)
      `)
      .order('created_at', { ascending: false });

    if (churchId) {
      contactQuery = contactQuery.eq('church_id', churchId);
      logger.log(`[DynamicContactTable] Filtering contacts by church_id: ${churchId}`);
    } else {
      logger.warn("[DynamicContactTable] No churchId provided to fetchContacts. Fetching all contacts (if RLS allows).");
    }

    const { data: contactsData, error: contactsError } = await contactQuery;

    if (contactsError) {
      logger.error('[DynamicContactTable] Error fetching contacts', contactsError);
      throw new Error('No se pudieron cargar los contactos.');
    }

    // Fetch cells
    const { data: cellsData, error: cellsError } = await supabase
      .from('cells')
      .select('id, name');

    if (cellsError) {
      logger.error('[DynamicContactTable] Error fetching cells', cellsError);
      throw new Error('No se pudieron cargar las células.');
    }

    // Fetch leaders (profiles)
    const { data: leadersData, error: leadersError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    if (leadersError) {
      logger.error('[DynamicContactTable] Error fetching leaders', leadersError);
      throw new Error('No se pudieron cargar los líderes.');
    }

    // Process data to combine contacts with cells and leaders
    const processedData = contactsData?.map(contact => {
      const cell = cellsData?.find(c => c.id === contact.cell_id) || null;
      const leader = leadersData?.find(l => l.id === contact.leader_assigned) || null;
      
      return {
        ...contact,
        cell,
        leader,
        last_contact_date: contact.latest_log?.[0]?.contact_date || null
      };
    }) || [];

    logger.log(`[DynamicContactTable] Successfully fetched ${processedData.length} contacts.`);
    return processedData;
  };

  const { data: contacts, isLoading, isError, error } = useQuery<Contact[]>({
    queryKey: ['contacts', churchId],
    queryFn: () => fetchContacts(churchId),
    enabled: !!churchId,
  });

  // Log query results
  useEffect(() => {
    if (contacts) {
      logger.log('[DynamicContactTable] Contacts data updated', { count: contacts.length });
    }
  }, [contacts]);

  useEffect(() => {
    if (isError) {
      logger.error('[DynamicContactTable] Query error', error);
    }
  }, [isError, error]);

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      logger.log('[DynamicContactTable] Deleting contact', { contactId });
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

      if (error) {
        logger.error('[DynamicContactTable] Error deleting contact', error);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      logger.log('[DynamicContactTable] Contact deleted successfully');
      showSuccess('Contacto(s) eliminado(s) con éxito.');
      queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
      setSelectedContacts([]);
    },
    onError: (err: any) => {
      logger.error('[DynamicContactTable] Error in delete mutation', err);
      showError(err.message || 'Error al eliminar el contacto.');
    },
  });

  const handleColumnChange = (columnIndex: number, newFieldKey: string) => {
    logger.log('[DynamicContactTable] Changing column', { columnIndex, newFieldKey });
    const newField = extendedContactFields.find(f => f.key === newFieldKey);
    if (newField) {
      setVisibleColumns(prevColumns => {
        const updatedColumns = [...prevColumns];
        updatedColumns[columnIndex] = newField;
        return updatedColumns;
      });
    }
  };

  const handleSelectAll = () => {
    logger.log('[DynamicContactTable] Select all triggered', {
      selectedCount: selectedContacts.length,
      totalCount: contacts?.length
    });
    if (selectedContacts.length === contacts?.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts?.map(c => c.id) || []);
    }
  };

  const handleSelectContact = (contactId: string) => {
    logger.log('[DynamicContactTable] Select contact', { contactId });
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleDeleteSelected = () => {
    logger.log('[DynamicContactTable] Delete selected triggered', { count: selectedContacts.length });
    if (selectedContacts.length === 0) {
      logger.warn('[DynamicContactTable] No contacts selected for deletion');
      return;
    }
    if (window.confirm(`¿Estás seguro de que deseas eliminar ${selectedContacts.length} contacto(s)?`)) {
      selectedContacts.forEach(contactId => {
        deleteContactMutation.mutate(contactId);
      });
    }
  };

  const handleEditContact = (contactId: string) => {
    logger.log('[DynamicContactTable] Edit contact triggered', { contactId });
    setEditingContactId(contactId);
    setProfileContactId(contactId);
  };

  const handleViewProfile = (contactId: string) => {
    logger.log('[DynamicContactTable] View profile triggered', { contactId });
    setProfileContactId(contactId);
  };

  // Handle drag and drop for column reordering
  const handleDragStart = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableHeaderCellElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTableHeaderCellElement>, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"));
    if (dragIndex !== dropIndex) {
      const newColumns = [...visibleColumns];
      const [draggedColumn] = newColumns.splice(dragIndex, 1);
      newColumns.splice(dropIndex, 0, draggedColumn);
      setVisibleColumns(newColumns);
    }
  };

  if (isLoading) {
    logger.log('[DynamicContactTable] Loading contacts');
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    logger.error("[DynamicContactTable] Error loading contacts", error);
    showError(error?.message || 'Error al cargar los contactos.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los contactos.'}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Selection Toolbar */}
      {selectedContacts.length > 0 && (
        <SelectionToolbar
          selectedContacts={selectedContacts}
          handleEditContact={handleEditContact}
          handleDeleteSelected={handleDeleteSelected}
          deleteContactMutation={deleteContactMutation}
        />
      )}

      {/* Contacts Table */}
      <div className="overflow-x-auto border rounded-md">
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
                <TableHeaderCell
                  key={column.key + index}
                  column={column}
                  index={index}
                  visibleColumns={visibleColumns}
                  extendedContactFields={extendedContactFields}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  handleColumnChange={handleColumnChange}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts && contacts.length > 0 ? (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className={selectedContacts.includes(contact.id) ? "bg-muted" : ""}
                >
                  <TableCell className="align-top">
                    <Checkbox
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={() => handleSelectContact(contact.id)}
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCellContent
                      key={column.key}
                      contact={contact}
                      column={column}
                      selectedContacts={selectedContacts}
                      handleSelectContact={handleSelectContact}
                      handleViewProfile={handleViewProfile}
                    />
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

      {/* Contact Profile Dialog */}
      <ContactProfileDialog
        open={!!profileContactId}
        onOpenChange={(open) => {
          if (!open) {
            setProfileContactId(null);
            setEditingContactId(null);
          }
        }}
        contactId={profileContactId}
        churchId={churchId || ''}
      />
    </div>
  );
};

export default DynamicContactTable;