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
  cell?: { name: string } | null;
  leader?: { first_name: string; last_name: string } | null;
}

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
  handleViewProfile
}: {
  contact: Contact;
  column: ContactField;
  handleViewProfile: (contactId: string) => void;
}) => {
  const formatCompactDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "d/MM/yy", { locale: es });
    } catch {
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
      title={(contact as any)[column.key] || undefined}
    >
      {column.key === 'created_at' || column.key === 'last_contact_date' ? (
        (contact as any)[column.key] ? formatCompactDate((contact as any)[column.key] as string) : '-'
      ) : column.key === 'cell.name' ? (
        contact.cell?.name || '-'
      ) : column.key === 'leader.first_name' ? (
        contact.leader ? `${contact.leader.first_name} ${contact.leader.last_name}` : '-'
      ) : (
        truncateText((contact as any)[column.key] as string)
      )}
    </TableCell>
  );
};

const SelectionToolbar = ({
  selectedCount,
  canEdit,
  onEdit,
  onDeleteSelected,
  isDeleting
}: {
  selectedCount: number;
  canEdit: boolean;
  onEdit: () => void;
  onDeleteSelected: () => void;
  isDeleting: boolean;
}) => (
  <div className="flex items-center justify-between p-3 bg-muted rounded-md">
    <div className="text-sm text-muted-foreground">
      {selectedCount} contacto(s) seleccionado(s)
    </div>
    <div className="flex space-x-2">
      <Button variant="outline" size="sm" onClick={onEdit} disabled={!canEdit}>
        <Edit className="mr-2 h-4 w-4" />
        Editar
      </Button>
      <Button variant="destructive" size="sm" onClick={onDeleteSelected} disabled={isDeleting}>
        <Trash2 className="mr-2 h-4 w-4" />
        Eliminar Seleccionados
      </Button>
    </div>
  </div>
);

const DynamicContactTable = ({ churchId, searchTerm = '', filterField = null as string | null }: { churchId?: string; searchTerm?: string; filterField?: string | null }) => {
  logger.log('[DynamicContactTable] Component rendered', { churchId, searchTerm, filterField });

  const extendedContactFields = useMemo(() => [
    ...CONTACT_FIELDS,
    { key: 'cell.name', label: 'Célula', type: 'text' },
    { key: 'leader.first_name', label: 'Referente', type: 'text' },
    { key: 'last_contact_date', label: 'Último Contacto', type: 'date' }
  ], []);

  const defaultVisibleColumns: ContactField[] = useMemo(() => [
    extendedContactFields.find(f => f.key === 'first_name')!,
    extendedContactFields.find(f => f.key === 'last_name')!,
    extendedContactFields.find(f => f.key === 'phone')!,
    extendedContactFields.find(f => f.key === 'cell.name')!,
    extendedContactFields.find(f => f.key === 'leader.first_name')!,
    extendedContactFields.find(f => f.key === 'last_contact_date')!,
    extendedContactFields.find(f => f.key === 'created_at')!,
  ].filter(Boolean), [extendedContactFields]);

  const storageKey = useMemo(() => `contacts_visible_columns_${churchId || 'global'}`, [churchId]);
  const [visibleColumns, setVisibleColumns] = useState<ContactField[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const keys: string[] = JSON.parse(raw);
        const map = new Map(extendedContactFields.map(f => [f.key, f]));
        const restored = keys.map(k => map.get(k)).filter(Boolean) as ContactField[];
        if (restored.length > 0) return restored;
      }
    } catch {}
    return defaultVisibleColumns;
  });

  useEffect(() => {
    try {
      const keys = visibleColumns.map(c => c.key);
      localStorage.setItem(storageKey, JSON.stringify(keys));
    } catch {}
  }, [visibleColumns, storageKey]);

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [profileContactId, setProfileContactId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fetchContacts = async (churchId?: string): Promise<Contact[]> => {
    let contactQuery = supabase
      .from('contacts')
      .select(`
        *,
        latest_log:contact_logs(contact_date)
      `)
      .order('created_at', { ascending: false });

    if (churchId) contactQuery = contactQuery.eq('church_id', churchId);

    const { data: contactsData, error: contactsError } = await contactQuery;
    if (contactsError) throw new Error('No se pudieron cargar los contactos.');

    const { data: cellsData, error: cellsError } = await supabase.from('cells').select('id, name');
    if (cellsError) throw new Error('No se pudieron cargar las células.');

    const { data: leadersData, error: leadersError } = await supabase.from('profiles').select('id, first_name, last_name');
    if (leadersError) throw new Error('No se pudieron cargar los referentes.');

    const processedData = (contactsData || []).map((c: any) => {
      const cell = (cellsData || []).find((x: any) => x.id === c.cell_id) || null;
      const leader = (leadersData || []).find((x: any) => x.id === c.leader_assigned) || null;
      return {
        ...c,
        cell,
        leader,
        last_contact_date: c.latest_log?.[0]?.contact_date || null
      } as Contact;
    });

    return processedData;
  };

  const { data: contacts, isLoading, isError, error } = useQuery<Contact[]>({
    queryKey: ['contacts', churchId],
    queryFn: () => fetchContacts(churchId),
    enabled: !!churchId,
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      showSuccess('Contacto(s) eliminado(s) con éxito.');
      queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
      setSelectedContacts([]);
    },
    onError: (err: any) => {
      showError(err.message || 'Error al eliminar el contacto.');
    },
  });

  const handleColumnChange = (columnIndex: number, newFieldKey: string) => {
    const newField = extendedContactFields.find(f => f.key === newFieldKey);
    if (newField) {
      setVisibleColumns(prev => {
        const updated = [...prev];
        updated[columnIndex] = newField;
        return updated;
      });
    }
  };

  const handleSelectAll = (visibleIds: string[]) => {
    if (visibleIds.every(id => selectedContacts.includes(id))) {
      setSelectedContacts(selectedContacts.filter(id => !visibleIds.includes(id)));
    } else {
      const union = Array.from(new Set([...selectedContacts, ...visibleIds]));
      setSelectedContacts(union);
    }
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedContacts(prev => prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]);
  };

  const handleDeleteSelected = (ids: string[]) => {
    if (ids.length === 0) return;
    if (window.confirm(`¿Estás seguro de que deseas eliminar ${ids.length} contacto(s)?`)) {
      ids.forEach(id => deleteContactMutation.mutate(id));
    }
  };

  const handleViewProfile = (contactId: string) => setProfileContactId(contactId);

  const filteredContacts = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!contacts) return [];
    if (!term) return contacts;

    const match = (c: Contact, key?: string | null) => {
      if (!key) {
        const haystack = [
          c.first_name, c.last_name, c.email, c.phone, c.address, c.barrio,
          c.cell?.name || '',
          c.leader ? `${c.leader.first_name} ${c.leader.last_name}` : ''
        ].join(' ').toLowerCase();
        return haystack.includes(term);
      }
      if (key === 'leader_assigned') {
        const leaderName = c.leader ? `${c.leader.first_name} ${c.leader.last_name}`.toLowerCase() : '';
        return leaderName.includes(term);
      }
      const value = (c as any)[key];
      if (typeof value === 'string') return value.toLowerCase().includes(term);
      return false;
    };

    return contacts.filter(c => match(c, filterField));
  }, [contacts, searchTerm, filterField]);

  const visibleIds = filteredContacts.map(c => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedContacts.includes(id));
  const someVisibleSelected = visibleIds.some(id => selectedContacts.includes(id)) && !allVisibleSelected;

  // Append an actions column rendering at the end (not in visibleColumns switching)
  const renderActionsCell = (c: Contact) => {
    const wa = (c.phone || '').replace(/[^\d]/g, '');
    const mapQ = encodeURIComponent((c as any).address || '');
    return (
      <div className="flex gap-2">
        <a
          href={wa ? `https://wa.me/${wa}` : '#'}
          target="_blank"
          rel="noreferrer"
          className={`text-xs px-2 py-1 rounded border ${wa ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
          onClick={(e) => { if (!wa) e.preventDefault(); }}
          title="Enviar Whatsapp"
        >
          Whatsapp
        </a>
        <a
          href={(c as any).address ? `https://www.google.com/maps/search/?api=1&query=${mapQ}` : '#'}
          target="_blank"
          rel="noreferrer"
          className={`text-xs px-2 py-1 rounded border ${ (c as any).address ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
          onClick={(e) => { if (!(c as any).address) e.preventDefault(); }}
          title="Ver Dirección en Mapa"
        >
          Ver mapa
        </a>
      </div>
    );
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
    showError((error as any)?.message || 'Error al cargar los contactos.');
    return <div className="text-red-500">Error: {(error as any)?.message || 'No se pudieron cargar los contactos.'}</div>;
  }

  return (
    <div className="space-y-4">
      {someVisibleSelected || allVisibleSelected ? (
        <SelectionToolbar
          selectedCount={visibleIds.filter(id => selectedContacts.includes(id)).length}
          canEdit={visibleIds.filter(id => selectedContacts.includes(id)).length === 1}
          onEdit={() => {
            const only = visibleIds.find(id => selectedContacts.includes(id));
            if (only) setProfileContactId(only);
          }}
          onDeleteSelected={() => handleDeleteSelected(visibleIds.filter(id => selectedContacts.includes(id)))}
          isDeleting={deleteContactMutation.isPending as any}
        />
      ) : null}

      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={() => handleSelectAll(visibleIds)}
                  aria-checked={someVisibleSelected ? 'mixed' : allVisibleSelected}
                />
              </TableHead>
              {visibleColumns.map((column, index) => (
                <TableHeaderCell
                  key={column.key + index}
                  column={column}
                  index={index}
                  visibleColumns={visibleColumns}
                  extendedContactFields={extendedContactFields}
                  handleDragStart={(e, i) => e.dataTransfer.setData("text/plain", i.toString())}
                  handleDragOver={(e) => e.preventDefault()}
                  handleDrop={(e, dropIndex) => {
                    e.preventDefault();
                    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"));
                    if (dragIndex !== dropIndex) {
                      const newColumns = [...visibleColumns];
                      const [dragged] = newColumns.splice(dragIndex, 1);
                      newColumns.splice(dropIndex, 0, dragged);
                      setVisibleColumns(newColumns);
                    }
                  }}
                  handleColumnChange={handleColumnChange}
                />
              ))}
              <TableHead className="w-40">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length > 0 ? (
              filteredContacts.map((contact) => (
                <TableRow key={contact.id} className={selectedContacts.includes(contact.id) ? "bg-muted" : ""}>
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
                      handleViewProfile={handleViewProfile}
                    />
                  ))}
                  <TableCell>{renderActionsCell(contact)}</TableCell>
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

      <ContactProfileDialog
        open={!!profileContactId}
        onOpenChange={(open) => {
          if (!open) setProfileContactId(null);
        }}
        contactId={profileContactId}
        churchId={churchId || ''}
      />
    </div>
  );
};

export default DynamicContactTable;