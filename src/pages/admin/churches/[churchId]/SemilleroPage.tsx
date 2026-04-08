"use client";
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users, AlertCircle, Search, Undo2, ChevronDown, Zap, ExternalLink, Upload, PlusCircle, RefreshCw, Eye, MessageSquare, MapPin, Trash2, Filter, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { normalize } from '@/lib/normalize';
import { isWithinGBA, getDistanceColor, getDistanceWarning, getDistanceBadgeClass } from '@/lib/geo-validation';
import CsvImporter from '@/components/admin/CsvImporter';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';
import ContactMapDialog from '@/components/admin/ContactMapDialog';
import WhatsAppComposeDialog, { WhatsAppIcon } from '@/components/admin/WhatsAppComposeDialog';
import AddContactDialog from '@/components/admin/AddContactDialog';
import ContactPipelineBadge from '@/components/admin/ContactPipelineBadge';

// ─── Types ───────────────────────────────────────────────────────
interface Zona { id: string; nombre: string; }
interface Barrio { id: string; nombre: string; zona_id: string; }
interface Cuerda { id: string; numero: string; zona_id: string; }
interface Cell {
  id: string; name: string; church_id: string; cuerda_id: string | null;
  address: string | null; lat: number | null; lng: number | null;
  meeting_day: string | null; meeting_time: string | null;
}

interface Contact {
  id: string; first_name: string; last_name: string | null;
  phone: string | null; address: string | null; barrio: string | null;
  zona_id: string | null; zona?: string | null;
  conector: string | null; fecha_contacto: string | null;
  numero_cuerda: string | null; edad: string | null;
  cell_id: string | null; estado_seguimiento?: string | null;
  lat?: number | null; lng?: number | null;
  sexo?: string | null;
  is_external?: boolean;
  responsable_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

// Haversine distance in km
const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Resizable Header ────────────────────────────────────────────
const ResizableHeader = ({ children, width, onResize, className = '' }: {
  children: React.ReactNode; width: number; onResize: (delta: number) => void; className?: string;
}) => {
  const startX = useRef(0);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); startX.current = e.clientX;
    const onMove = (ev: MouseEvent) => { onResize(ev.clientX - startX.current); startX.current = ev.clientX; };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  };
  return (
    <th className={`relative text-left text-xs font-medium text-muted-foreground px-3 py-2 select-none ${className}`} style={{ width, minWidth: 60 }}>
      {children}
      <div onMouseDown={onMouseDown} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors" />
    </th>
  );
};

// ─── Main Component ──────────────────────────────────────────────
const SemilleroPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { session, profile } = useSession();
  const queryClient = useQueryClient();

  const [activePool, setActivePool] = useState<string>('unassigned');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuerda, setFilterCuerda] = useState<string>('');
  const [filterResponsable, setFilterResponsable] = useState<string>('');
  // Sort state: which column and direction. null = default order from query.
  const [sortBy, setSortBy] = useState<'nombre' | 'fecha' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Track whether we've applied the per-user filter defaults yet, so we only
  // do it once per session and don't overwrite user changes on re-renders.
  const filterDefaultsAppliedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [mapContact, setMapContact] = useState<{ name: string; address: string; sugCell: { name: string; address: string | null; lat: number | null; lng: number | null; cuerdaNumero?: string; meetingDay?: string | null; meetingTime?: string | null } | null } | null>(null);
  const [whatsappCompose, setWhatsappCompose] = useState<{ contactId: string; name: string; firstName: string; lastName: string; phone: string } | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'auto' | 'manual' | 'cuerda_only';
    contactId?: string;
    cellId?: string;
    cellName?: string;
    cuerdaNum?: string;
    zonaName?: string;
    cuerdaZonaId?: string;
    preview?: { label: string; count: number }[];
  } | null>(null);
  const [undoData, setUndoData] = useState<{
    contactIds: string[];
    prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null; cell_id: string | null }[];
  } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Track the index (within filteredContacts) of the last checkbox the user
  // clicked, so shift-click can select the range between two clicks. Same
  // pattern as Gmail/file managers.
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);
  // Bulk-assign-responsable dialog state
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignTargetId, setBulkAssignTargetId] = useState<string>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const [colWidths, setColWidths] = useState({
    cuerda: 34, nombre: 130, responsable: 100, telefono: 110, direccion: 130, fechaContacto: 56, sugerencia: 150, asignar: 145,
  });
  const resizeCol = (col: keyof typeof colWidths) => (delta: number) => {
    setColWidths(prev => ({ ...prev, [col]: Math.max(60, prev[col] + delta) }));
  };

  // Assignment permission comes from canAssignContacts() via usePermissions
  const { canSeeBaseDatosTotal, canAddContacts, canImportCsv, canAssignContacts, canSendWhatsapp, canEditDeleteContacts } = usePermissions();
  const userCuerdaNumero = profile?.numero_cuerda || null;
  const canSeeAllCuerdas = canSeeBaseDatosTotal() || profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';

  // Per-user filter defaults: pre-load filterCuerda and filterResponsable based
  // on the logged-in user's profile so they see THEIR cuerda and THEIR contacts
  // by default. Conectores never see the responsable filter dropdown at all
  // (the backend already filters their query to created_by = themselves), so
  // for them we don't bother. Admins/generals/etc with no numero_cuerda assigned
  // default to "Todas las cuerdas". Runs once per session, never overwrites
  // user-driven changes.
  useEffect(() => {
    if (filterDefaultsAppliedRef.current) return;
    if (!profile || !session?.user?.id) return;
    if (profile.role !== 'conector') {
      // Pre-load Cuerda filter to user's own cuerda (or leave empty = "Todas" if null)
      if (userCuerdaNumero) {
        setFilterCuerda(userCuerdaNumero);
      }
      // Pre-load Responsable filter to "my contacts"
      setFilterResponsable(session.user.id);
    }
    filterDefaultsAppliedRef.current = true;
  }, [profile, session?.user?.id, userCuerdaNumero]);

  // ─── Data Fetching ─────────────────────────────────────────────
  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => { const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!).order('nombre'); return data || []; },
    enabled: !!churchId,
  });

  const { data: barrios } = useQuery<Barrio[]>({
    queryKey: ['barrios', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const { data } = await supabase.from('barrios').select('id, nombre, zona_id').in('zona_id', zonas.map(z => z.id));
      return data || [];
    },
    enabled: !!zonas?.length,
  });

  const { data: cuerdas } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas-pool', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id').in('zona_id', zonas.map(z => z.id));
      return data || [];
    },
    enabled: !!zonas?.length,
  });

  // Team members for Responsable dropdown
  const { data: teamMembers } = useQuery<{ id: string; first_name: string; last_name: string; numero_cuerda: string | null }[]>({
    queryKey: ['team-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name, numero_cuerda').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId,
  });

  // All profiles (used to resolve creator names; creators may be admins/generals
  // who don't belong to a specific church and so aren't in teamMembers).
  const { data: allProfiles } = useQuery<{ id: string; first_name: string; last_name: string }[]>({
    queryKey: ['all-profiles-creator-lookup'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name');
      return data || [];
    },
  });
  const profileById = React.useMemo(() => {
    const m = new Map<string, { first_name: string; last_name: string }>();
    (allProfiles || []).forEach(p => m.set(p.id, p));
    return m;
  }, [allProfiles]);

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, name, church_id, cuerda_id, address, lat, lng, meeting_day, meeting_time').eq('church_id', churchId!).is('deleted_at', null);
      return (data || []) as Cell[];
    },
    enabled: !!churchId,
  });

  const { data: allContacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-all-contacts', churchId],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, phone, address, barrio, zona_id, zona, conector, fecha_contacto, numero_cuerda, edad, cell_id, estado_seguimiento, lat, lng, sexo, is_external, responsable_id, created_by, created_at')
        .eq('church_id', churchId!)
        .is('deleted_at', null);
      if (profile?.role === 'conector') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) q = q.eq('created_by', user.id);
      }
      const { data } = await q.order('fecha_contacto', { ascending: false }).limit(2000);
      return (data || []) as Contact[];
    },
    enabled: !!churchId,
  });

  // ─── Auto-geocode contacts with address but no lat/lng (runs ONCE) ──────────
  const geocodedRef = useRef(false);
  useEffect(() => {
    if (geocodedRef.current) return;
    if (!allContacts?.length) return;
    const toGeocode = allContacts.filter(c => c.address && (c.lat == null || c.lng == null));
    if (toGeocode.length === 0) return;
    if (!(window as any).google?.maps) return;

    geocodedRef.current = true;
    const geocoder = new (window as any).google.maps.Geocoder();
    let processed = 0;

    toGeocode.forEach((contact, i) => {
      setTimeout(() => {
        // Append ", Buenos Aires, Argentina" to improve geocode accuracy
        const searchAddr = `${contact.address}, Buenos Aires, Argentina`;
        geocoder.geocode({ address: searchAddr }, async (results: any[], status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            // VALIDATE: only save if within Greater Buenos Aires area
            if (isWithinGBA(lat, lng)) {
              await supabase.from('contacts').update({ lat, lng }).eq('id', contact.id);
            }
            // If outside GBA, coordinates are wrong — don't save them
          }
          processed++;
          if (processed >= toGeocode.length) {
            queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          }
        });
      }, i * 300);
    });
  }, [allContacts, churchId, queryClient]);

  // ─── Cell suggestion by distance ───────────────────────────────
  // First detect zona from barrio/address text, then find cells in that zona sorted by distance
  const detectZonaForContact = useCallback((contact: Contact): Zona | null => {
    if (!zonas?.length) return null;
    const text = normalize((contact.barrio || '') + ' ' + (contact.address || ''));
    if (!text.trim()) return null;
    if (barrios?.length) {
      for (const barrio of barrios) {
        if (text.includes(normalize(barrio.nombre))) return zonas.find(z => z.id === barrio.zona_id) || null;
      }
    }
    return zonas.find(z => text.includes(normalize(z.nombre))) || null;
  }, [zonas, barrios]);

  // Get the cuerda number for a cell
  const getCuerdaNumero = useCallback((cell: Cell): string | null => {
    if (!cell.cuerda_id || !cuerdas?.length) return null;
    const cuerda = cuerdas.find(c => c.id === cell.cuerda_id);
    return cuerda?.numero || null;
  }, [cuerdas]);

  // Filter cells by gender: 1xx = Masculino, 2xx = Femenino, 3xx = either
  const filterCellsByGender = useCallback((allCells: Cell[], sexo: string | null | undefined): Cell[] => {
    if (!sexo) return allCells; // Unknown gender → show all cells
    const isFemale = sexo.toLowerCase() === 'femenino';
    const isMale = sexo.toLowerCase() === 'masculino';
    if (!isFemale && !isMale) return allCells;

    return allCells.filter(cell => {
      const num = getCuerdaNumero(cell);
      if (!num) return true; // No cuerda → include
      const prefix = parseInt(num.charAt(0));
      if (prefix === 3) return true; // 3xx → gender-neutral
      if (isFemale) return prefix === 2; // Women → 2xx only
      if (isMale) return prefix === 1; // Men → 1xx only
      return true;
    });
  }, [getCuerdaNumero]);

  // Get cells sorted by distance to a contact (filtered by gender)
  const getCellsByDistance = useCallback((contact: Contact, filterZona?: Zona | null): Cell[] => {
    if (!cells?.length) return [];

    // FIRST: filter by gender — 1xx for men, 2xx for women
    const genderFiltered = filterCellsByGender(cells, contact.sexo);

    // If contact has VALID coordinates, use PURE distance on gender-filtered cells
    if (contact.lat != null && contact.lng != null && isWithinGBA(contact.lat, contact.lng)) {
      const cellsWithDist = genderFiltered
        .filter(c => c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng))
        .map(cell => ({
          cell,
          dist: haversine(contact.lat!, contact.lng!, cell.lat!, cell.lng!),
        }));
      return cellsWithDist.sort((a, b) => a.dist - b.dist).map(x => x.cell);
    }

    // No coordinates — use zona filtering + text matching as fallback
    let candidates = genderFiltered;
    if (filterZona && cuerdas?.length) {
      const zonaCuerdaIds = cuerdas.filter(c => c.zona_id === filterZona.id).map(c => c.id);
      const zonaCells = genderFiltered.filter(c => c.cuerda_id && zonaCuerdaIds.includes(c.cuerda_id));
      if (zonaCells.length > 0) candidates = zonaCells;
    }

    const cellsWithScore = candidates.map(cell => {
      let score = 999;
      const contactText = normalize((contact.address || '') + ' ' + (contact.barrio || ''));
      const cellText = normalize(cell.address || '');
      if (cellText && contactText) {
        const contactWords = new Set(contactText.split(/\s+/).filter(w => w.length > 2));
        const cellWords = cellText.split(/\s+/).filter(w => w.length > 2);
        const shared = cellWords.filter(w => contactWords.has(w)).length;
        score = shared > 0 ? (100 - shared * 10) : 500;
      }
      return { cell, score };
    });

    return cellsWithScore.sort((a, b) => a.score - b.score).map(x => x.cell);
  }, [cells, cuerdas, filterCellsByGender]);

  // Compute suggestion: closest cell + its cuerda + zona
  const suggestions = useMemo(() => {
    const map: Record<string, { cell: Cell | null; cuerda: Cuerda | null; zona: Zona | null }> = {};
    allContacts?.forEach(c => {
      if (!c.zona_id && !c.cell_id) {
        const sugZona = detectZonaForContact(c);
        const sortedCells = getCellsByDistance(c, sugZona);
        const sugCell = sortedCells[0] || null;
        let sugCuerda: Cuerda | null = null;
        let sugZonaFinal = sugZona;
        if (sugCell?.cuerda_id && cuerdas?.length) {
          sugCuerda = cuerdas.find(cr => cr.id === sugCell.cuerda_id) || null;
          if (sugCuerda && zonas?.length) {
            sugZonaFinal = zonas.find(z => z.id === sugCuerda!.zona_id) || sugZona;
          }
        }
        map[c.id] = { cell: sugCell, cuerda: sugCuerda, zona: sugZonaFinal };
      }
    });
    return map;
  }, [allContacts, detectZonaForContact, getCellsByDistance, cuerdas, zonas]);

  // Home zona (most contacts)
  const homeZonaId = useMemo(() => {
    if (!allContacts?.length || !zonas?.length) return null;
    const counts: Record<string, number> = {};
    allContacts.forEach(c => { if (c.zona_id) counts[c.zona_id] = (counts[c.zona_id] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || zonas[0]?.id || null;
  }, [allContacts, zonas]);

  // ─── Pool counts ───────────────────────────────────────────────
  // Semillero Externo: contacts flagged as external (nearest cell is in a different zona)
  const externalContacts = useMemo(() => (allContacts || []).filter(c => (c as any).is_external === true && !c.cell_id), [allContacts]);

  const externalIds = useMemo(() => new Set(externalContacts.map(c => c.id)), [externalContacts]);

  const poolCounts = useMemo(() => {
    let unassigned = 0;
    allContacts?.forEach(c => {
      if (!c.zona_id && !c.cell_id) {
        if (!canSeeAllCuerdas && userCuerdaNumero && c.numero_cuerda !== userCuerdaNumero) return;
        if (externalIds.has(c.id)) return;
        unassigned++;
      }
    });
    return { unassigned };
  }, [allContacts, canSeeAllCuerdas, userCuerdaNumero, externalIds]);


  // ─── Filtered contacts ─────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered: Contact[];
    if (activePool === 'unassigned') filtered = allContacts.filter(c => !c.zona_id && !c.cell_id && !externalIds.has(c.id));
    else if (activePool === 'external') filtered = externalContacts;
    else filtered = [];
    // Cuerda filter: non-global users only see contacts with their cuerda
    if (!canSeeAllCuerdas && userCuerdaNumero) {
      filtered = filtered.filter(c => c.numero_cuerda === userCuerdaNumero);
    }
    if (searchTerm) {
      const s = normalize(searchTerm);
      filtered = filtered.filter(c =>
        normalize(c.first_name || '').includes(s) || normalize(c.last_name || '').includes(s) ||
        normalize(c.address || '').includes(s) || normalize(c.barrio || '').includes(s) ||
        normalize(c.phone || '').includes(s)
      );
    }
    if (filterCuerda) {
      filtered = filtered.filter(c => c.numero_cuerda === filterCuerda);
    }
    if (filterResponsable === '__none__') {
      filtered = filtered.filter(c => !c.responsable_id);
    } else if (filterResponsable) {
      filtered = filtered.filter(c => c.responsable_id === filterResponsable);
    }
    // Sorting - applied last so it ranks the final filtered set
    if (sortBy === 'nombre') {
      filtered = [...filtered].sort((a, b) => {
        const an = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const bn = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return sortDir === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an);
      });
    } else if (sortBy === 'fecha') {
      filtered = [...filtered].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortDir === 'asc' ? at - bt : bt - at;
      });
    }
    return filtered;
  }, [allContacts, activePool, searchTerm, filterCuerda, filterResponsable, externalContacts, externalIds, canSeeAllCuerdas, userCuerdaNumero, sortBy, sortDir]);

  // How many of the currently-selected contacts are actually visible in the
  // filtered view. Prevents the "Seleccionados" counter from showing stale
  // ghost numbers when filters/refresh change which rows are on screen.
  const visibleSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const visibleIds = new Set(filteredContacts.map(c => c.id));
    let count = 0;
    selectedIds.forEach(id => { if (visibleIds.has(id)) count++; });
    return count;
  }, [selectedIds, filteredContacts]);

  // Pool is always unassigned or external view now (no zona cards)
  const isUnassignedView = true;

  // ─── Auto-assign preview ───────────────────────────────────────
  const autoAssignPreview = useMemo(() => {
    const counts: Record<string, number> = {};
    let noMatch = 0;
    allContacts?.forEach(c => {
      if (c.zona_id || c.cell_id) return;
      const sug = suggestions[c.id];
      if (sug?.cell) {
        const label = sug.cell.name + (sug.cuerda ? ` (Cuerda ${sug.cuerda.numero})` : '');
        counts[label] = (counts[label] || 0) + 1;
      } else { noMatch++; }
    });
    const result = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    if (noMatch > 0) result.push({ label: '❌ Sin célula cercana (no se asignarán)', count: noMatch });
    return result;
  }, [allContacts, suggestions]);

  // ─── Mutations ─────────────────────────────────────────────────
  const assignSingleMutation = useMutation({
    mutationFn: async ({ contactId, cellId }: { contactId: string; cellId: string }) => {
      const contact = allContacts?.find(c => c.id === contactId);
      const cell = cells?.find(c => c.id === cellId);
      // Derive zona and cuerda from cell
      let zonaId: string | null = null;
      let zonaName: string | null = null;
      let cuerdaNum: string | null = null;
      if (cell?.cuerda_id && cuerdas?.length) {
        const cuerda = cuerdas.find(cr => cr.id === cell.cuerda_id);
        if (cuerda) {
          cuerdaNum = cuerda.numero;
          const zona = zonas?.find(z => z.id === cuerda.zona_id);
          if (zona) { zonaId = zona.id; zonaName = zona.nombre; }
        }
      }
      const { error } = await supabase.from('contacts').update({
        cell_id: cellId, zona_id: zonaId, zona: zonaName, numero_cuerda: cuerdaNum,
        pool_assigned_at: new Date().toISOString(), pool_assigned_by: session?.user?.id,
      }).eq('id', contactId);
      if (error) throw error;
      // Log transfer
      await supabase.from('contact_transfers').insert({
        contact_id: contactId,
        from_cuerda: contact?.numero_cuerda || null,
        to_cuerda: cuerdaNum,
        from_zona: contact?.zona || null,
        to_zona: zonaName,
        from_cell_id: contact?.cell_id || null,
        to_cell_id: cellId,
        transferred_by: session?.user?.id,
        transfer_type: 'pool_assignment',
      });
      setUndoData({
        contactIds: [contactId],
        prevStates: [{ zona_id: contact?.zona_id || null, zona: contact?.zona || null, numero_cuerda: contact?.numero_cuerda || null, cell_id: contact?.cell_id || null }],
      });
    },
    onSuccess: () => { showSuccess('Contacto asignado a célula.'); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); setConfirmDialog(null); },
    onError: (err: any) => showError(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!allContacts) return 0;
      const ids: string[] = [];
      const prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null; cell_id: string | null }[] = [];
      let count = 0;
      for (const contact of allContacts) {
        if (contact.zona_id || contact.cell_id) continue;
        const sug = suggestions[contact.id];
        if (!sug?.cell) continue;
        let zonaId: string | null = null; let zonaName: string | null = null; let cuerdaNum: string | null = null;
        if (sug.cell.cuerda_id && cuerdas?.length) {
          const cuerda = cuerdas.find(cr => cr.id === sug.cell!.cuerda_id);
          if (cuerda) { cuerdaNum = cuerda.numero; const z = zonas?.find(zn => zn.id === cuerda.zona_id); if (z) { zonaId = z.id; zonaName = z.nombre; } }
        }
        ids.push(contact.id);
        prevStates.push({ zona_id: contact.zona_id, zona: contact.zona || null, numero_cuerda: contact.numero_cuerda, cell_id: contact.cell_id });
        await supabase.from('contacts').update({
          cell_id: sug.cell.id, zona_id: zonaId, zona: zonaName, numero_cuerda: cuerdaNum,
          pool_assigned_at: new Date().toISOString(), pool_assigned_by: session?.user?.id,
        }).eq('id', contact.id);
        // Log transfer
        await supabase.from('contact_transfers').insert({
          contact_id: contact.id,
          from_cuerda: contact.numero_cuerda || null,
          to_cuerda: cuerdaNum,
          from_zona: contact.zona || null,
          to_zona: zonaName,
          from_cell_id: contact.cell_id || null,
          to_cell_id: sug.cell.id,
          transferred_by: session?.user?.id,
          transfer_type: 'auto_assignment',
        });
        count++;
      }
      if (count === 0) throw new Error('No se pudo asignar ningún contacto.');
      setUndoData({ contactIds: ids, prevStates });
      return count;
    },
    onSuccess: (count) => { showSuccess(`${count} contacto(s) asignados.`); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); setConfirmDialog(null); },
    onError: (err: any) => showError(err.message || 'Error al autoasignar.'),
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!undoData) return;
      for (let i = 0; i < undoData.contactIds.length; i++) {
        const prev = undoData.prevStates[i];
        await supabase.from('contacts').update({
          zona_id: prev.zona_id, zona: prev.zona, numero_cuerda: prev.numero_cuerda, cell_id: prev.cell_id,
          pool_assigned_at: null, pool_assigned_by: null,
        }).eq('id', undoData.contactIds[i]);
      }
    },
    onSuccess: () => { showSuccess('Deshecho.'); setUndoData(null); queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] }); },
    onError: (err: any) => showError(err.message),
  });

  // ─── Cell dropdown items sorted by distance ────────────────────
  const getCellDropdownItems = useCallback((contact: Contact) => {
    const sugZona = detectZonaForContact(contact);
    const sorted = getCellsByDistance(contact, sugZona);
    // Also add cells from other zones
    const allSorted = getCellsByDistance(contact, null);
    const inZoneIds = new Set(sorted.map(c => c.id));
    const otherCells = allSorted.filter(c => !inZoneIds.has(c.id));
    return { inZone: sorted, otherZone: otherCells };
  }, [detectZonaForContact, getCellsByDistance]);

  const getCellLabel = (cell: Cell) => {
    const cuerda = cuerdas?.find(cr => cr.id === cell.cuerda_id);
    const zona = cuerda ? zonas?.find(z => z.id === cuerda.zona_id) : null;
    return { name: cell.name, cuerda: cuerda?.numero, zona: zona?.nombre };
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Semillero</h1>
          <p className="text-muted-foreground text-xs mt-1">Asignación de contactos a células por cercanía</p>
        </div>
        {undoData && (
          <Button variant="outline" size="sm" onClick={() => undoMutation.mutate()} disabled={undoMutation.isPending} className="gap-1.5 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300">
            <Undo2 className="h-4 w-4" /> Deshacer ({undoData.contactIds.length})
          </Button>
        )}
      </div>

      {/* Pool Cards — Sin asignar + Semillero Externo + counters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Card className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'unassigned' ? 'ring-2 ring-primary' : ''}`} onClick={() => { setActivePool('unassigned'); setSearchTerm(''); }}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Sin asignar</p>
                <p className={`text-2xl font-bold tabular-nums ${poolCounts.unassigned > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : poolCounts.unassigned}</p>
              </div>
              {poolCounts.unassigned > 0 && <AlertCircle className="h-6 w-6 text-yellow-500 opacity-70 ml-3" />}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'external' ? 'ring-2 ring-orange-500' : ''} ${externalContacts.length > 0 ? 'border-orange-500/30' : ''}`} onClick={() => { setActivePool('external'); setSearchTerm(''); }}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-orange-400">Semillero Externo</p>
                <p className={`text-2xl font-bold tabular-nums ${externalContacts.length > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : externalContacts.length}</p>
              </div>
              {externalContacts.length > 0 && <ExternalLink className="h-5 w-5 text-orange-400 opacity-70 ml-3" />}
            </div>
          </CardContent>
        </Card>
        {visibleSelectedCount > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[11px] text-primary">Seleccionados</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{visibleSelectedCount}</p>
            </CardContent>
          </Card>
        )}
        {(filterCuerda || filterResponsable || searchTerm) && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[11px] text-blue-400">En este filtro</p>
              <p className="text-2xl font-bold tabular-nums text-blue-400">{filteredContacts.length}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {activePool === 'unassigned' && canAssignContacts() && poolCounts.unassigned > 0 && (
          <Button size="sm" onClick={() => setConfirmDialog({ type: 'auto', preview: autoAssignPreview })} className="gap-1.5">
            <Zap className="h-4 w-4" /> Autoasignar todos ({poolCounts.unassigned})
          </Button>
        )}
        {visibleSelectedCount > 0 && canEditDeleteContacts() && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setBulkAssignTargetId(''); setBulkAssignOpen(true); }}
            className="gap-1.5"
          >
            <Users className="h-4 w-4" /> Asignar Responsable ({visibleSelectedCount})
          </Button>
        )}
        {visibleSelectedCount > 0 && canEditDeleteContacts() && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkDeleteOpen(true)}
            className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" /> Eliminar ({visibleSelectedCount})
          </Button>
        )}
        {canImportCsv() && (
          <Button variant="outline" size="sm" onClick={() => setCsvDialogOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar Contactos
          </Button>
        )}
        {canAddContacts() && (
          <Button size="sm" onClick={() => setAddContactOpen(true)} className="gap-1.5">
            <PlusCircle className="h-4 w-4" /> Crear Contacto
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={async () => {
          setRefreshing(true);
          await queryClient.invalidateQueries({ queryKey: ['cells-pool', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['cuerdas-pool', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['zonas', churchId] });
          await queryClient.invalidateQueries({ queryKey: ['barrios', churchId] });
          geocodedRef.current = false;
          showSuccess('Datos actualizados.');
          setRefreshing(false);
        }} className="gap-1.5" title="Actualizar datos">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </Button>
        <div className="flex-1" />
        {profile?.role !== 'conector' && (
          <>
            <select className="h-8 text-xs border rounded px-2 bg-background" value={filterCuerda} onChange={e => setFilterCuerda(e.target.value)}>
              <option value="">Todas las cuerdas</option>
              {[...new Set((allContacts || []).map(c => c.numero_cuerda).filter(Boolean))].sort().map(n => (
                <option key={n} value={n!}>Cuerda {n}</option>
              ))}
            </select>
            <select className="h-8 text-xs border rounded px-2 bg-background max-w-[180px]" value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)}>
              <option value="">Todos los responsables</option>
              {session?.user?.id && (
                <option value={session.user.id}>⭐ Mis contactos</option>
              )}
              <option value="__none__">Sin responsable</option>
              {(() => {
                const creatorIds = new Set<string>();
                (allContacts || []).forEach(c => { if (c.responsable_id) creatorIds.add(c.responsable_id); });
                const creators = Array.from(creatorIds)
                  .map(id => ({ id, profile: profileById.get(id) }))
                  .filter(c => c.profile && c.id !== session?.user?.id)
                  .sort((a, b) => (a.profile!.first_name || '').localeCompare(b.profile!.first_name || ''));
                return creators.map(c => (
                  <option key={c.id} value={c.id}>{c.profile!.first_name} {c.profile!.last_name}</option>
                ));
              })()}
            </select>
          </>
        )}
        <div className="relative w-52 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 860 }}>
                <thead>
                  <tr className="border-b">
                    <th className="px-1 py-2 w-6">
                      <input type="checkbox" className="rounded border-input" checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0} onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filteredContacts.map(c => c.id)));
                        else setSelectedIds(new Set());
                      }} />
                    </th>
                    <ResizableHeader width={colWidths.nombre} onResize={resizeCol('nombre')}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => {
                          if (sortBy !== 'nombre') { setSortBy('nombre'); setSortDir('asc'); }
                          else if (sortDir === 'asc') { setSortDir('desc'); }
                          else { setSortBy(null); }
                        }}
                        title="Ordenar por nombre"
                      >
                        Nombre
                        {sortBy === 'nombre'
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </ResizableHeader>
                    <ResizableHeader width={colWidths.telefono} onResize={resizeCol('telefono')}>Teléfono</ResizableHeader>
                    <ResizableHeader width={colWidths.responsable} onResize={resizeCol('responsable')}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                            Responsable
                            <Filter className={`h-3 w-3 ${filterResponsable ? 'text-primary fill-primary/30' : 'opacity-60'}`} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" collisionPadding={16} className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Filtrar por responsable</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setFilterResponsable('')} className={filterResponsable === '' ? 'bg-accent' : ''}>
                            Todos
                          </DropdownMenuItem>
                          {session?.user?.id && (
                            <DropdownMenuItem onClick={() => setFilterResponsable(session.user.id)} className={filterResponsable === session.user.id ? 'bg-accent' : ''}>
                              ⭐ Mis contactos
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setFilterResponsable('__none__')} className={filterResponsable === '__none__' ? 'bg-accent' : ''}>
                            Sin responsable
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(() => {
                            // Build unique responsable list from current contacts
                            const creatorIds = new Set<string>();
                            (allContacts || []).forEach(c => { if (c.responsable_id) creatorIds.add(c.responsable_id); });
                            const creators = Array.from(creatorIds)
                              .map(id => ({ id, profile: profileById.get(id) }))
                              .filter(c => c.profile && c.id !== session?.user?.id)
                              .sort((a, b) => (a.profile!.first_name || '').localeCompare(b.profile!.first_name || ''));
                            return creators.map(c => (
                              <DropdownMenuItem key={c.id} onClick={() => setFilterResponsable(c.id)} className={filterResponsable === c.id ? 'bg-accent' : ''}>
                                {c.profile!.first_name} {c.profile!.last_name}
                              </DropdownMenuItem>
                            ));
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ResizableHeader>
                    <ResizableHeader width={colWidths.direccion} onResize={resizeCol('direccion')}>Dirección</ResizableHeader>
                    <ResizableHeader width={colWidths.fechaContacto} onResize={resizeCol('fechaContacto')}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => {
                          if (sortBy !== 'fecha') { setSortBy('fecha'); setSortDir('desc'); }
                          else if (sortDir === 'desc') { setSortDir('asc'); }
                          else { setSortBy(null); }
                        }}
                        title="Ordenar por fecha"
                      >
                        Fecha
                        {sortBy === 'fecha'
                          ? (sortDir === 'desc' ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </ResizableHeader>
                    {isUnassignedView && <ResizableHeader width={colWidths.sugerencia} onResize={resizeCol('sugerencia')}>Sugerencia</ResizableHeader>}
                    {isUnassignedView && canAssignContacts() && <ResizableHeader width={colWidths.asignar} onResize={resizeCol('asignar')}>Asignar</ResizableHeader>}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={20} className="text-sm text-muted-foreground py-10 text-center">
                        {searchTerm
                          ? 'Sin resultados para tu búsqueda.'
                          : (filterCuerda || filterResponsable)
                            ? 'No hay contactos que coincidan con los filtros aplicados.'
                            : activePool === 'unassigned' ? 'Todos asignados ✅' : 'Semillero Externo vacío.'}
                      </td>
                    </tr>
                  )}
                  {filteredContacts.map((c, idx) => {
                    const sug = suggestions[c.id];
                    const sugCell = sug?.cell;
                    const sugCuerda = sug?.cuerda;
                    const sugZona = sug?.zona;
                    const hasAddress = !!(c.address || c.barrio);
                    const isExternal = sugZona && homeZonaId && sugZona.id !== homeZonaId;
                    const responsable = teamMembers?.find(m => m.id === c.responsable_id);

                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                        {/* Selection checkbox - supports shift-click range select */}
                        <td className="px-1 py-1.5 w-6">
                          <input
                            type="checkbox"
                            className="rounded border-input"
                            checked={selectedIds.has(c.id)}
                            onClick={(e) => {
                              // Shift-click: select the range from lastClickedIdx to current idx.
                              // Range is INCLUSIVE on both ends. The action (select vs deselect)
                              // matches the new state of the clicked checkbox, so shift-clicking
                              // an unchecked one selects the range, and shift-clicking a checked
                              // one deselects the range.
                              const isShift = (e as any).nativeEvent?.shiftKey;
                              if (isShift && lastClickedIdx !== null && lastClickedIdx !== idx) {
                                e.preventDefault(); // we'll set the state ourselves
                                const start = Math.min(lastClickedIdx, idx);
                                const end = Math.max(lastClickedIdx, idx);
                                const next = new Set(selectedIds);
                                const willSelect = !selectedIds.has(c.id); // toggle direction based on the clicked row
                                for (let i = start; i <= end; i++) {
                                  const rowId = filteredContacts[i]?.id;
                                  if (!rowId) continue;
                                  if (willSelect) next.add(rowId); else next.delete(rowId);
                                }
                                setSelectedIds(next);
                                setLastClickedIdx(idx);
                              }
                            }}
                            onChange={(e) => {
                              // Skip if the click handler already handled it (shift-click case).
                              // Otherwise normal toggle behavior.
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(c.id); else next.delete(c.id);
                              setSelectedIds(next);
                              setLastClickedIdx(idx);
                            }}
                          />
                        </td>

                        {/* Nombre (con ojo) */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.nombre }}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="flex items-center gap-1.5 hover:underline text-left text-sm font-medium" onClick={() => setSelectedContactId(c.id)}>
                                <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {c.first_name} {c.last_name || ''}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Ver contacto</p></TooltipContent>
                          </Tooltip>
                        </td>

                        {/* Teléfono + WhatsApp - on mobile we hide the number text and keep just the WhatsApp button to save horizontal space */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.telefono }}>
                          {c.phone ? (
                            <div className="flex items-center justify-between gap-1">
                              <span className="hidden sm:inline text-[11px] text-foreground tabular-nums font-medium truncate">{c.phone}</span>
                              {canSendWhatsapp() && (
                                <button
                                  className="flex items-center gap-0.5 text-green-500 hover:text-green-400 shrink-0 group"
                                  title="Enviar WhatsApp"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWhatsappCompose({
                                      contactId: c.id,
                                      name: `${c.first_name} ${c.last_name || ''}`.trim(),
                                      firstName: c.first_name,
                                      lastName: c.last_name || '',
                                      phone: c.phone!,
                                    });
                                  }}
                                >
                                  <span className="text-[10px] font-medium">Enviar</span>
                                  <WhatsAppIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5 group-hover:scale-110 transition-transform" />
                                </button>
                              )}
                            </div>
                          ) : <span className="text-[11px] text-muted-foreground">—</span>}
                        </td>

                        {/* Responsable */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.responsable }}>
                          {(() => {
                            const resp = c.responsable_id ? profileById.get(c.responsable_id) : null;
                            if (!resp) return <span className="text-[11px] text-muted-foreground italic">—</span>;
                            return <span className="text-[11px] text-foreground truncate block">{resp.first_name} {resp.last_name}</span>;
                          })()}
                        </td>

                        {/* Dirección + Ver en mapa */}
                        <td className="px-2 py-1.5" style={{ width: colWidths.direccion }}>
                          {c.address ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs truncate max-w-[150px]">{c.address}</span>
                              <button
                                className="text-primary hover:text-primary/80 shrink-0"
                                title="Ver en mapa"
                                onClick={() => {
                                  const sugCell = sug?.cell;
                                  const sugCuerdaNum = sug?.cuerda?.numero;
                                  setMapContact({
                                    name: `${c.first_name} ${c.last_name || ''}`.trim(),
                                    address: c.address!,
                                    sugCell: sugCell ? { name: sugCell.name, address: sugCell.address, lat: sugCell.lat, lng: sugCell.lng, cuerdaNumero: sugCuerdaNum || undefined, meetingDay: sugCell.meeting_day, meetingTime: sugCell.meeting_time } : null,
                                  });
                                }}
                              >
                                <MapPin className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>

                        {/* Fecha (created_at) */}
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums" style={{ width: colWidths.fechaContacto }}>
                          {c.created_at ? new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                        </td>

                        {/* Sugerencia (Célula + Zona combinadas — all same color) */}
                        {isUnassignedView && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.sugerencia }}>
                            {sugCell ? (() => {
                              const hasDist = c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng) && sugCell.lat != null && sugCell.lng != null;
                              const dist = hasDist ? haversine(c.lat!, c.lng!, sugCell.lat!, sugCell.lng!) : null;
                              const badgeClass = dist != null ? getDistanceBadgeClass(dist) : (isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15');
                              const textColor = dist != null ? getDistanceColor(dist) : (isExternal ? 'text-orange-400' : 'text-green-500');
                              return (
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <Badge className={`text-[9px] shrink-0 ${badgeClass}`}>{sugCell.name}</Badge>
                                  {sugZona && <span className={`text-[9px] truncate ${textColor}`}>{sugZona.nombre}{isExternal ? ' ↗' : ''}</span>}
                                  {dist != null && <span className={`text-[9px] font-medium shrink-0 ${textColor}`}>{dist.toFixed(1)}km</span>}
                                </div>
                              );
                            })() : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        )}

                        {/* Assign button */}
                        {isUnassignedView && canAssignContacts() && (
                          <td className="px-2 py-1.5" style={{ width: colWidths.asignar }}>
                            {(c as any).is_external && activePool === 'external' ? (
                              <div className="flex items-center gap-1">
                                {sugCell && (
                                  <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={() => setConfirmDialog({
                                    type: 'manual', contactId: c.id, cellId: sugCell.id, cellName: sugCell.name,
                                    cuerdaNum: sugCuerda?.numero, zonaName: sugZona?.nombre,
                                  })}>
                                    <Zap className="h-3 w-3 mr-1" /> Asignar
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-1.5"><ChevronDown className="h-3 w-3" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" collisionPadding={16} className="w-64 max-h-[min(340px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">Asignar solo a cuerda</DropdownMenuLabel>
                                    {(cuerdas || []).filter(cr => {
                                      const prefix = parseInt(cr.numero.charAt(0));
                                      const sexo = c.sexo?.toLowerCase();
                                      if (sexo === 'femenino' && prefix === 1) return false;
                                      if (sexo === 'masculino' && prefix === 2) return false;
                                      return true;
                                    }).map(cr => {
                                      const zona = zonas?.find(z => z.id === cr.zona_id);
                                      return (
                                        <DropdownMenuItem key={`cuerda-ext-${cr.id}`} className="text-xs" onClick={() => setConfirmDialog({
                                          type: 'cuerda_only', contactId: c.id, cellId: '', cellName: `Cuerda ${cr.numero}`,
                                          cuerdaNum: cr.numero, zonaName: zona?.nombre, cuerdaZonaId: zona?.id,
                                        })}>
                                          <span className="font-mono font-medium">{cr.numero}</span>
                                          {zona && <span className="text-[10px] text-muted-foreground ml-1.5">{zona.nombre}</span>}
                                        </DropdownMenuItem>
                                      );
                                    })}
                                    <DropdownMenuSeparator />
                                    {(() => {
                                      const { inZone, otherZone } = getCellDropdownItems(c);
                                      return (
                                        <>
                                          {inZone.length > 0 && (
                                            <>
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">Células cercanas</DropdownMenuLabel>
                                              {inZone.map(cell => {
                                                const info = getCellLabel(cell);
                                                return (
                                                  <DropdownMenuItem key={cell.id} className="text-xs" onClick={() => setConfirmDialog({
                                                    type: 'manual', contactId: c.id, cellId: cell.id, cellName: cell.name,
                                                    cuerdaNum: info.cuerda, zonaName: info.zona,
                                                  })}>
                                                    <span className="font-medium">{cell.name}</span>
                                                    {info.cuerda && <Badge variant="secondary" className="ml-1.5 text-[9px] font-mono">{info.cuerda}</Badge>}
                                                  </DropdownMenuItem>
                                                );
                                              })}
                                            </>
                                          )}
                                          {otherZone.length > 0 && (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-orange-400 py-1">Otras zonas</DropdownMenuLabel>
                                              {otherZone.slice(0, 10).map(cell => {
                                                const info = getCellLabel(cell);
                                                return (
                                                  <DropdownMenuItem key={cell.id} className="text-xs" onClick={() => setConfirmDialog({
                                                    type: 'manual', contactId: c.id, cellId: cell.id, cellName: cell.name,
                                                    cuerdaNum: info.cuerda, zonaName: info.zona,
                                                  })}>
                                                    <span>{cell.name}</span>
                                                    {info.zona && <span className="text-[10px] text-orange-400 ml-1">{info.zona}</span>}
                                                  </DropdownMenuItem>
                                                );
                                              })}
                                            </>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={async () => {
                                  await supabase.from('contacts').update({ is_external: false }).eq('id', c.id);
                                  showSuccess('Contacto devuelto al Semillero Sin Asignar.');
                                  queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                }}>
                                  <Undo2 className="h-3 w-3 mr-1" /> Devolver
                                </Button>
                              </div>
                            ) : !hasAddress ? (
                              <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600/30 cursor-help">Sin dirección</Badge></TooltipTrigger>
                                <TooltipContent><p className="text-xs">Completá la dirección para asignar.</p></TooltipContent></Tooltip>
                            ) : (
                              <div className="flex items-center gap-1">
                                {sugCell && !isExternal && (
                                  <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={() => setConfirmDialog({
                                    type: 'manual', contactId: c.id, cellId: sugCell.id, cellName: sugCell.name,
                                    cuerdaNum: sugCuerda?.numero, zonaName: sugZona?.nombre,
                                  })}>
                                    <Zap className="h-3 w-3 mr-1" /> Asignar
                                  </Button>
                                )}
                                {sugCell && isExternal && (
                                  <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 border-orange-500/50 text-orange-400" onClick={async () => {
                                    await supabase.from('contacts').update({ is_external: true }).eq('id', c.id);
                                    showSuccess('Contacto movido al Semillero Externo.');
                                    queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                                  }}>
                                    <ExternalLink className="h-3 w-3 mr-1" /> Externo
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-1.5"><ChevronDown className="h-3 w-3" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" collisionPadding={16} className="w-64 max-h-[min(340px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">Asignar solo a cuerda</DropdownMenuLabel>
                                    {(cuerdas || []).filter(cr => {
                                      const prefix = parseInt(cr.numero.charAt(0));
                                      const sexo = c.sexo?.toLowerCase();
                                      if (sexo === 'femenino' && prefix === 1) return false;
                                      if (sexo === 'masculino' && prefix === 2) return false;
                                      return true;
                                    }).map(cr => {
                                      const zona = zonas?.find(z => z.id === cr.zona_id);
                                      return (
                                        <DropdownMenuItem key={`cuerda-${cr.id}`} className="text-xs" onClick={() => setConfirmDialog({
                                          type: 'cuerda_only', contactId: c.id, cellId: '', cellName: `Cuerda ${cr.numero}`,
                                          cuerdaNum: cr.numero, zonaName: zona?.nombre, cuerdaZonaId: zona?.id,
                                        })}>
                                          <span className="font-mono font-medium">{cr.numero}</span>
                                          {zona && <span className="text-[10px] text-muted-foreground ml-1.5">{zona.nombre}</span>}
                                        </DropdownMenuItem>
                                      );
                                    })}
                                    <DropdownMenuSeparator />
                                    {(() => {
                                      const { inZone, otherZone } = getCellDropdownItems(c);
                                      return (
                                        <>
                                          {inZone.length > 0 && (
                                            <>
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">Células cercanas</DropdownMenuLabel>
                                              {inZone.map(cell => {
                                                const info = getCellLabel(cell);
                                                return (
                                                  <DropdownMenuItem key={cell.id} className="text-xs" onClick={() => setConfirmDialog({
                                                    type: 'manual', contactId: c.id, cellId: cell.id, cellName: cell.name,
                                                    cuerdaNum: info.cuerda, zonaName: info.zona,
                                                  })}>
                                                    <span className="font-medium">{cell.name}</span>
                                                    {info.cuerda && <Badge variant="secondary" className="ml-1.5 text-[9px] font-mono">{info.cuerda}</Badge>}
                                                  </DropdownMenuItem>
                                                );
                                              })}
                                            </>
                                          )}
                                          {otherZone.length > 0 && (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-orange-400 py-1">Otras zonas</DropdownMenuLabel>
                                              {otherZone.slice(0, 10).map(cell => {
                                                const info = getCellLabel(cell);
                                                return (
                                                  <DropdownMenuItem key={cell.id} className="text-xs" onClick={() => setConfirmDialog({
                                                    type: 'manual', contactId: c.id, cellId: cell.id, cellName: cell.name,
                                                    cuerdaNum: info.cuerda, zonaName: info.zona,
                                                  })}>
                                                    <span>{cell.name}</span>
                                                    {info.zona && <span className="text-[10px] text-orange-400 ml-1">{info.zona}</span>}
                                                  </DropdownMenuItem>
                                                );
                                              })}
                                            </>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.type === 'auto' ? 'Autoasignar contactos' : 'Confirmar asignación'}</DialogTitle>
            <DialogDescription asChild>
              <div>
                {confirmDialog?.type === 'auto' ? (
                  <>
                    <p>Se asignarán los contactos a la célula más cercana según su dirección.</p>
                    {confirmDialog.preview && confirmDialog.preview.length > 0 && (
                      <div className="mt-3 space-y-1 border rounded-md p-3 bg-muted/50">
                        <p className="text-xs font-medium text-foreground mb-2">Vista previa:</p>
                        {confirmDialog.preview.map(p => (
                          <div key={p.label} className="flex justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                            <span>{p.label}</span>
                            <span className="font-mono font-medium tabular-nums">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    ¿Asignar a <strong>{confirmDialog?.cellName}</strong>
                    {confirmDialog?.cuerdaNum && <> (Cuerda {confirmDialog.cuerdaNum})</>}
                    {confirmDialog?.zonaName && <> — {confirmDialog.zonaName}</>}?
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmDialog(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (confirmDialog?.type === 'auto') autoAssignMutation.mutate();
                else if (confirmDialog?.type === 'cuerda_only' && confirmDialog?.contactId && confirmDialog?.cuerdaNum) {
                  // Assign to cuerda only (no cell)
                  const zona = zonas?.find(z => z.id === confirmDialog.cuerdaZonaId);
                  const { error } = await supabase.from('contacts').update({
                    numero_cuerda: confirmDialog.cuerdaNum,
                    zona_id: zona?.id || null,
                    zona: zona?.nombre || null,
                    cell_id: null,
                  }).eq('id', confirmDialog.contactId);
                  if (error) showError(error.message);
                  else {
                    showSuccess(`Contacto asignado a Cuerda ${confirmDialog.cuerdaNum}.`);
                    queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
                    queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
                  }
                  setConfirmDialog(null);
                }
                else if (confirmDialog?.contactId && confirmDialog?.cellId) assignSingleMutation.mutate({ contactId: confirmDialog.contactId, cellId: confirmDialog.cellId });
              }}
              disabled={autoAssignMutation.isPending || assignSingleMutation.isPending}
            >
              {(autoAssignMutation.isPending || assignSingleMutation.isPending) ? 'Asignando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="sm:max-w-[1200px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Contactos desde CSV o Excel</DialogTitle>
            <DialogDescription>
              Los contactos importados aparecerán en el pool "Sin asignar" para que puedas verificar sus direcciones y asignarles una célula.
            </DialogDescription>
          </DialogHeader>
          <CsvImporter
            tableName="contacts"
            requiredFields={CONTACT_FIELDS.filter(f => f.key === 'first_name' || f.key === 'sexo')}
            optionalFields={CONTACT_FIELDS.filter(f => f.key !== 'first_name' && f.key !== 'sexo')}
            churchId={churchId}
          />
        </DialogContent>
      </Dialog>

      {/* Contact Profile Dialog */}
      <ContactProfileDialog
        open={!!selectedContactId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedContactId(null);
            queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
          }
        }}
        contactId={selectedContactId || ''}
        churchId={churchId!}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { if (!o && !deleting) setBulkDeleteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar contactos</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar <strong>{selectedIds.size}</strong> contacto{selectedIds.size === 1 ? '' : 's'}? Los vas a poder restaurar desde la Papelera.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                const ids = Array.from(selectedIds);
                const { error } = await supabase.from('contacts')
                  .update({ deleted_at: new Date().toISOString(), deleted_by: session?.user?.id || null })
                  .in('id', ids);
                setDeleting(false);
                if (error) { showError(error.message); return; }
                showSuccess(`${ids.length} contacto${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}.`);
                setSelectedIds(new Set());
                setBulkDeleteOpen(false);
                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={(o) => {
          setAddContactOpen(o);
          if (!o) queryClient.refetchQueries({ queryKey: ['pool-all-contacts', churchId] });
        }}
        churchId={churchId!}
      />

      {/* Contact Map Dialog */}
      <ContactMapDialog
        open={!!mapContact}
        onOpenChange={(o) => { if (!o) setMapContact(null); }}
        contactName={mapContact?.name || ''}
        contactAddress={mapContact?.address || ''}
        suggestedCell={mapContact?.sugCell || null}
      />
      <WhatsAppComposeDialog
        open={!!whatsappCompose}
        onOpenChange={(o) => { if (!o) setWhatsappCompose(null); }}
        contactName={whatsappCompose?.name || ''}
        contactFirstName={whatsappCompose?.firstName || ''}
        contactLastName={whatsappCompose?.lastName || ''}
        contactPhone={whatsappCompose?.phone || ''}
        churchId={churchId}
        onSent={async (message, templateName) => {
          // Log WhatsApp send to contact history
          if (!whatsappCompose) return;
          const contactId = whatsappCompose.contactId;
          try {
            const session = (await supabase.auth.getSession()).data.session;
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
            const note = templateName
              ? `WhatsApp enviado a las ${time} usando plantilla "${templateName}".`
              : `WhatsApp enviado a las ${time} (sin plantilla).`;
            const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/add-contact-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
              body: JSON.stringify({
                contactId,
                churchId,
                contact_date: today,
                contact_method: 'WhatsApp',
                notes: note,
              }),
            });
            if (!resp.ok) {
              console.error('add-contact-log failed:', resp.status, await resp.text());
              showError('No se pudo registrar el envío en el historial.');
              return;
            }
            showSuccess('Envío registrado en el historial.');
            queryClient.invalidateQueries({ queryKey: ['contact-logs-inline', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact_logs', contactId] });
          } catch (e) { console.error('Failed to log WhatsApp send:', e); showError('Error registrando el envío.'); }
        }}
      />

      {/* Floating action bar - appears at bottom of viewport when contacts are selected.
          Solves the problem of having to scroll back to the top to find the delete
          button when the user selects a contact at the bottom of a long list. */}
      {visibleSelectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 px-4 py-3 rounded-xl bg-background border-2 border-primary/40 shadow-2xl backdrop-blur-sm max-w-[95vw]" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(255,194,51,0.2)' }}>
          <span className="text-sm font-medium">
            <strong className="text-primary">{visibleSelectedCount}</strong> seleccionado{visibleSelectedCount === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Limpiar
          </button>
          {canEditDeleteContacts() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setBulkAssignTargetId(''); setBulkAssignOpen(true); }}
              className="gap-1.5"
            >
              <Users className="h-4 w-4" /> Asignar Responsable
            </Button>
          )}
          {canEditDeleteContacts() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      )}

      {/* Bulk-assign Responsable dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={(o) => { if (!o && !bulkAssigning) setBulkAssignOpen(false); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Asignar Responsable</DialogTitle>
            <DialogDescription>
              Vas a asignar un responsable a <strong>{visibleSelectedCount}</strong> contacto{visibleSelectedCount === 1 ? '' : 's'}.
              Esto va a sobreescribir el responsable actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nuevo responsable</label>
            <select
              className="w-full h-9 text-sm border rounded px-2 bg-background"
              value={bulkAssignTargetId}
              onChange={(e) => setBulkAssignTargetId(e.target.value)}
              disabled={bulkAssigning}
            >
              <option value="">Seleccionar responsable...</option>
              <option value="__none__">— Sin responsable (limpiar)</option>
              {(teamMembers || [])
                .filter(m => m.id)
                .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))
                .map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
            </select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBulkAssignOpen(false)} disabled={bulkAssigning}>Cancelar</Button>
            <Button
              disabled={bulkAssigning || !bulkAssignTargetId}
              onClick={async () => {
                if (!bulkAssignTargetId) return;
                setBulkAssigning(true);
                // Only act on the contacts that are actually visible in the
                // current filtered view, matching the visibleSelectedCount UI.
                const visibleIds = new Set(filteredContacts.map(c => c.id));
                const ids = Array.from(selectedIds).filter(id => visibleIds.has(id));
                const newResponsableId = bulkAssignTargetId === '__none__' ? null : bulkAssignTargetId;
                const { error } = await supabase
                  .from('contacts')
                  .update({ responsable_id: newResponsableId })
                  .in('id', ids);
                setBulkAssigning(false);
                if (error) { showError(error.message); return; }
                showSuccess(`${ids.length} contacto${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}.`);
                setSelectedIds(new Set());
                setBulkAssignOpen(false);
                setBulkAssignTargetId('');
                queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
              }}
            >
              {bulkAssigning ? 'Asignando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SemilleroPage;
