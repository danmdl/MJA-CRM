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
import { ChevronDown, Trash2, Edit, GripVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONTACT_FIELDS, ContactField } from '@/lib/contact-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { logger } from '@/utils/logger';
import ContactProfileDialog from './ContactProfileDialog';
import { logEvent } from '@/utils/clientLogger';
import { createPortal } from 'react-dom';
import { normalize as norm } from '@/lib/normalize';

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
  created_by: string | null;
  estado_seguimiento?: string | null;
  cell?: { name: string; address?: string | null; lat?: number | null; lng?: number | null } | null;
  leader?: { first_name: string; last_name: string } | null;
  created_by_profile?: { first_name: string | null; last_name: string | null } | null;
}

const TableHeaderCell = ({
  column,
  index,
  contacts,
  activeFilters,
  onFilterChange,
  handleDragStart,
  handleDragOver,
  handleDrop,
}: {
  column: ContactField;
  index: number;
  contacts: Contact[];
  activeFilters: Record<string, string[]>;
  onFilterChange: (fieldKey: string, values: string[]) => void;
  handleDragStart: (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => void;
  handleDragOver: (e: React.DragEvent<HTMLTableHeaderCellElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLTableHeaderCellElement>, dropIndex: number) => void;
}) => {
  const uniqueValues = React.useMemo(() => {
    const vals = new Set<string>();
    contacts.forEach(c => {
      let raw: string | null | undefined;
      if (column.key === 'cell.name') raw = c.cell?.name;
      else if (column.key === 'leader.first_name') raw = c.leader ? `${c.leader.first_name} ${c.leader.last_name}`.trim() : null;
      else raw = (c as any)[column.key];
      if (raw && typeof raw === 'string' && raw.trim()) vals.add(raw.trim());
    });
    return Array.from(vals).sort((a, b) => a.localeCompare(b, 'es'));
  }, [contacts, column.key]);

  const selected = activeFilters[column.key] || [];
  const hasFilter = selected.length > 0;

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    onFilterChange(column.key, next);
  };

  return (
    <TableHead
      key={column.key + index}
      draggable
      onDragStart={(e) => handleDragStart(e, index)}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, index)}
      className={`cursor-move ${column.key === 'apartment_number' ? 'w-24' : ''} ${column.key === 'last_contact_date' ? 'w-32' : ''}`}
    >
      <div className="flex items-center gap-1">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={`flex items-center gap-1 h-auto p-0 font-semibold hover:text-primary ${hasFilter ? 'text-primary' : 'text-foreground'}`}
            >
              {column.label}
              {hasFilter
                ? <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{selected.length}</span>
                : <ChevronDown className="ml-1 h-3 w-3" />
              }
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
            {uniqueValues.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Sin valores disponibles</div>
            ) : (
              <>
                {hasFilter && (
                  <>
                    <div
                      className="px-3 py-1.5 text-xs text-primary cursor-pointer hover:underline"
                      onClick={() => onFilterChange(column.key, [])}
                    >
                      Limpiar filtro ({selected.length})
                    </div>
                    <div className="border-t my-1" />
                  </>
                )}
                {uniqueValues.map(val => (
                  <DropdownMenuCheckboxItem
                    key={val}
                    checked={selected.includes(val)}
                    onCheckedChange={() => toggle(val)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {val}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableHead>
  );
};

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

  const waNumber = (contact.phone || '').replace(/[^\d]/g, '');
  const mapQuery = encodeURIComponent((contact as any).address || '');

  const baseContent = () => {
    if (column.key === 'created_at') {
      const v = (contact as any)[column.key] as string | null | undefined;
      return v ? formatCompactDate(v) : '-';
    }
    if (column.key === 'last_contact_date') {
      const val = (contact as any).last_contact_date as string | null | undefined;
      if (!val) return '-';
      const days = Math.floor((Date.now() - new Date(val).getTime()) / (1000 * 60 * 60 * 24));
      const red = days >= 7;
      return (
        <span className={`inline-flex items-center gap-2 ${red ? 'text-red-600' : ''}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${red ? 'bg-red-600' : 'bg-muted-foreground/40'}`} />
          {formatCompactDate(val)}
        </span>
      );
    }
    if (column.key === 'cell.name') {
      if (!contact.cell) return '-';
      return (
        <div className="flex gap-1">
          {contact.cell.address && (
            <button
              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/search/${encodeURIComponent(contact.cell!.address!)}`, '_blank'); }}
              title={contact.cell.address}
            >
              Ver Dirección
            </button>
          )}
          {contact.cell.lat && contact.cell.lng && (
            <button
              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps?q=${contact.cell!.lat},${contact.cell!.lng}`, '_blank'); }}
            >
              Ver Mapa
            </button>
          )}
        </div>
      );
    }
    if (column.key === 'leader.first_name') {
      return contact.leader ? `${contact.leader.first_name} ${contact.leader.last_name}` : '-';
    }
    if (column.key === 'age') {
      return (contact as any).age ?? '-';
    }
    if (column.key === 'created_by_profile') {
      const p = (contact as any).created_by_profile;
      if (!p) return '-';
      return `${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
    }
    return truncateText((contact as any)[column.key] as string);
  };

  return (
    <TableCell
      className={`align-top max-w-xs truncate ${column.key === 'first_name' || column.key === 'last_name' ? "cursor-pointer hover:underline" : ""}`}
      onClick={() => {
        if (column.key === 'first_name' || column.key === 'last_name') {
          handleViewProfile(contact.id);
        }
      }}
      title={((contact as any)[column.key] as string) || undefined}
    >
      <div className="space-y-2">
        <div>{baseContent()}</div>

        {/* Acciones dentro de la misma celda para Teléfono y Dirección */}
        {column.key === 'phone' && (
          <div className="flex gap-2">
            <a
              href={waNumber ? `https://wa.me/${waNumber}` : '#'}
              target="_blank"
              rel="noreferrer"
              className={`text-xs px-2 py-1 rounded border ${waNumber ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
              onClick={(e) => { if (!waNumber) e.preventDefault(); }}
            >
              Enviar Whatsapp
            </a>
          </div>
        )}
        {column.key === 'address' && (
          <div className="flex gap-2">
            <a
              href={(contact as any).address ? `https://www.google.com/maps/search/?api=1&query=${mapQuery}` : '#'}
              target="_blank"
              rel="noreferrer"
              className={`text-xs px-2 py-1 rounded border ${ (contact as any).address ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
              onClick={(e) => { if (!(contact as any).address) e.preventDefault(); }}
            >
              Ver Dirección en Mapa
            </a>
          </div>
        )}
      </div>
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
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground whitespace-nowrap">{selectedCount} seleccionado(s)</span>
    <Button variant="outline" size="sm" onClick={onEdit} disabled={!canEdit}>
      <Edit className="mr-1.5 h-3.5 w-3.5" />
      Editar
    </Button>
    <Button variant="destructive" size="sm" onClick={onDeleteSelected} disabled={isDeleting}>
      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
      Eliminar
    </Button>
  </div>
);

const DynamicContactTable = ({ 
  churchId, 
  searchTerm = '', 
  filterField = null as string | null,
  ageGroup = null as string | null,
  cuerdaFilter = null as string | null,
  useExternalToolbarContainer = false,
  canEdit: canEditProp = true,
  canDelete: canDeleteProp = true,
  canAdd: canAddProp = true,
}: { churchId?: string; searchTerm?: string; filterField?: string | null; ageGroup?: string | null; cuerdaFilter?: string | null; useExternalToolbarContainer?: boolean; canEdit?: boolean; canDelete?: boolean; canAdd?: boolean }) => {
  logger.log('[DynamicContactTable] Component rendered', { churchId, searchTerm, filterField });

  const extendedContactFields = useMemo(() => [
    ...CONTACT_FIELDS,
    { key: 'cell.name', label: 'Célula', type: 'text' },
    { key: 'leader.first_name', label: 'Líder de Célula', type: 'text' },
    { key: 'last_contact_date', label: 'Último Contacto', type: 'date' },
    { key: 'created_by_profile', label: 'Creado por', type: 'text' },
    { key: 'created_at', label: 'Fecha de Creación', type: 'date' },
  ], []);

  // Default columns: N° Cuerda, Conector, Nombre, Apellido, Dirección, Teléfono, Célula, Líder, Último Contacto, Fecha Creación
  const defaultVisibleColumns: ContactField[] = useMemo(() => [
    extendedContactFields.find(f => f.key === 'numero_cuerda')!,
    extendedContactFields.find(f => f.key === 'conector')!,
    extendedContactFields.find(f => f.key === 'first_name')!,
    extendedContactFields.find(f => f.key === 'last_name')!,
    extendedContactFields.find(f => f.key === 'address')!,
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
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  const handleColumnFilterChange = (fieldKey: string, values: string[]) => {
    setColumnFilters(prev => {
      if (values.length === 0) {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      }
      return { ...prev, [fieldKey]: values };
    });
  };

  const activeFilterCount = Object.values(columnFilters).filter(v => v.length > 0).length;
  const [profileContactId, setProfileContactId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const computeAge = (dob?: string | null) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

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

    const { data: cellsData, error: cellsError } = await supabase.from('cells').select('id, name, address, lat, lng');
    if (cellsError) throw new Error('No se pudieron cargar las células.');

    const { data: leadersData, error: leadersError } = await supabase.from('profiles').select('id, first_name, last_name');
    if (leadersError) throw new Error('No se pudieron cargar los referentes.');

    const processedData = contactsData?.map(contact => {
      const cell = cellsData?.find(c => c.id === contact.cell_id) || null;
      const leader = leadersData?.find(l => l.id === contact.leader_assigned) || null;
      const age = computeAge(contact.date_of_birth || null);
      const createdByProfile = contact.created_by ? (leadersData?.find(l => l.id === contact.created_by) || null) : null;
      return {
        ...contact,
        cell,
        leader,
        last_contact_date: contact.latest_log?.[0]?.contact_date || null,
        age,
        created_by_profile: createdByProfile,
      };
    }) || [];

    return processedData;
  };

  const { data: contacts, isLoading, isError, error } = useQuery<Contact[]>({
    queryKey: ['contacts', churchId],
    queryFn: () => fetchContacts(churchId),
    enabled: !!churchId,
  });

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
      logEvent({ action: 'delete_contact', error: err, context: { church_id: churchId } });
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


  const getAgeGroup = (age: number | null): string | null => {
    if (age === null) return null;
    if (age <= 12) return 'Niño';
    if (age <= 17) return 'Adolescente';
    if (age <= 25) return 'Joven';
    if (age <= 35) return 'Joven Adulto';
    if (age <= 59) return 'Adulto';
    return 'Crecer';
  };

  const getEffectiveAge = (contact: any): number | null => {
    if (contact.edad != null) return Number(contact.edad);
    return contact.age ?? null;
  };

  const handleViewProfile = (contactId: string) => setProfileContactId(contactId);

  const AGE_GROUPS: Record<string, [number, number]> = {
    nino:         [0,  12],
    adolescente:  [13, 17],
    joven:        [18, 25],
    joven_adulto: [26, 35],
    adulto:       [36, 59],
    crecer:       [60, 999],
  };

  const getContactAge = (c: any): number | null => {
    // Use edad field first, then calculate from date_of_birth
    if (c.edad != null && c.edad !== '') return Number(c.edad);
    if (c.date_of_birth) {
      const dob = new Date(c.date_of_birth);
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
      return age >= 0 ? age : null;
    }
    return null;
  };

  const filteredContacts = useMemo(() => {
    const term = norm((searchTerm || '').trim());
    if (!contacts) return [];

    return contacts.filter(c => {
      // Search term filter
      if (term) {
        const match = (key?: string | null): boolean => {
          if (!key) {
            const haystack = norm([
              c.first_name, c.last_name, c.email, c.phone, c.address, c.barrio,
              c.cell?.name || '',
              c.leader ? `${c.leader.first_name} ${c.leader.last_name}` : ''
            ].join(' '));
            return haystack.includes(term);
          }
          if (key === 'leader_assigned') {
            const leaderName = c.leader ? norm(`${c.leader.first_name} ${c.leader.last_name}`) : '';
            return leaderName.includes(term);
          }
          const value = (c as any)[key];
          if (typeof value === 'string') return norm(value).includes(term);
          return false;
        };
        if (!match(filterField)) return false;
      }

      // Column value filters
      for (const [fieldKey, values] of Object.entries(columnFilters)) {
        if (values.length === 0) continue;
        let cellVal: string | null | undefined;
        if (fieldKey === 'cell.name') cellVal = c.cell?.name;
        else if (fieldKey === 'leader.first_name') cellVal = c.leader ? `${c.leader.first_name} ${c.leader.last_name}`.trim() : null;
        else cellVal = (c as any)[fieldKey];
        if (!cellVal || !values.includes(cellVal.trim())) return false;
      }

      // Age group filter
      if (ageGroup) {
        const effectiveAge = getEffectiveAge(c);
        if (getAgeGroup(effectiveAge) !== ageGroup) return false;
      }

      // Cuerda filter
      if (cuerdaFilter) {
        if ((c as any).numero_cuerda !== cuerdaFilter) return false;
      }

      return true;
    });
  }, [contacts, searchTerm, filterField, columnFilters, ageGroup, cuerdaFilter]);

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

  // Determine external portal container if requested
  const externalContainer = useExternalToolbarContainer ? document.getElementById('selection-toolbar-slot') : null;
  const selectedCount = visibleIds.filter(id => selectedContacts.includes(id)).length;
  const canEdit = selectedCount === 1;

  return (
    <div className="space-y-4">
      {/* Render selection toolbar externally (right side of header) if enabled and container exists.
          The toolbar is wrapped in an absolutely positioned wrapper so it doesn't change the header's layout height. */}
      {(someVisibleSelected || allVisibleSelected) && canDeleteProp && useExternalToolbarContainer && externalContainer &&
        createPortal(
          <SelectionToolbar
              selectedCount={selectedCount}
              canEdit={canEdit}
              onEdit={() => {
                const only = visibleIds.find(id => selectedContacts.includes(id));
                if (only) setProfileContactId(only);
              }}
              onDeleteSelected={() => handleDeleteSelected(visibleIds.filter(id => selectedContacts.includes(id)))}
              isDeleting={deleteContactMutation.isPending as any}
            />,
          externalContainer
        )
      }

      {/* Internal toolbar (fallback) only when not using external container */}
      <div className={useExternalToolbarContainer ? '' : 'relative'}>
        {canDeleteProp && !useExternalToolbarContainer && (someVisibleSelected || allVisibleSelected) && (
          <div className="absolute top-0 left-0 right-0 z-10">
            <SelectionToolbar
              selectedCount={selectedCount}
              canEdit={canEdit}
              onEdit={() => {
                const only = visibleIds.find(id => selectedContacts.includes(id));
                if (only) setProfileContactId(only);
              }}
              onDeleteSelected={() => handleDeleteSelected(visibleIds.filter(id => selectedContacts.includes(id)))}
              isDeleting={deleteContactMutation.isPending as any}
            />
          </div>
        )}
        <div className={useExternalToolbarContainer ? '' : 'pt-14'}>
          {/* Columns Picker + clear filters */}
          <div className="flex justify-end items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setColumnFilters({})}>
                Limpiar filtros ({activeFilterCount})
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="mb-2">
                  <Plus className="h-4 w-4 mr-2" />
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {extendedContactFields.map(field => (
                  <DropdownMenuCheckboxItem
                    key={field.key}
                    checked={visibleColumns.some(vc => vc.key === field.key)}
                    onCheckedChange={(checked) => {
                      setVisibleColumns(prev => {
                        if (checked) {
                          if (prev.some(p => p.key === field.key)) return prev;
                          return [...prev, field];
                        } else {
                          const filtered = prev.filter(p => p.key !== field.key);
                          return filtered.length > 0 ? filtered : prev;
                        }
                      });
                    }}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Contacts Table */}
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
                      contacts={contacts || []}
                      activeFilters={columnFilters}
                      onFilterChange={handleColumnFilterChange}
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
                    />
                  ))}
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
        </div>
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