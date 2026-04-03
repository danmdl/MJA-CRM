"use client";
import React, { useState, useMemo, useCallback, useRef } from 'react';
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
  Users, AlertCircle, Search, Undo2, ChevronDown, Zap, ExternalLink, Upload,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import CsvImporter from '@/components/admin/CsvImporter';
import { CONTACT_FIELDS } from '@/lib/contact-fields';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';

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
  cell_id: string | null;
  lat?: number | null; lng?: number | null;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
const PoolPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { session, profile } = useSession();
  const queryClient = useQueryClient();

  const [activePool, setActivePool] = useState<string>('unassigned');
  const [searchTerm, setSearchTerm] = useState('');
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'auto' | 'manual';
    contactId?: string;
    cellId?: string;
    cellName?: string;
    cuerdaNum?: string;
    zonaName?: string;
    preview?: { label: string; count: number }[];
  } | null>(null);
  const [undoData, setUndoData] = useState<{
    contactIds: string[];
    prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null; cell_id: string | null }[];
  } | null>(null);

  const [colWidths, setColWidths] = useState({
    nombre: 150, apellido: 130, edad: 55, direccion: 200, asignar: 130, celulaSug: 160, zonaSug: 120, cuerda: 90,
  });
  const resizeCol = (col: keyof typeof colWidths) => (delta: number) => {
    setColWidths(prev => ({ ...prev, [col]: Math.max(60, prev[col] + delta) }));
  };

  const isAdminOrPastor = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';

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

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells-pool', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, name, church_id, cuerda_id, address, lat, lng, meeting_day, meeting_time').eq('church_id', churchId!);
      return (data || []) as Cell[];
    },
    enabled: !!churchId,
  });

  const { data: allContacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-all-contacts', churchId],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, phone, address, barrio, zona_id, zona, conector, fecha_contacto, numero_cuerda, edad, cell_id')
        .eq('church_id', churchId!);
      if (profile?.role === 'conector') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) q = q.eq('created_by', user.id);
      }
      const { data } = await q.order('fecha_contacto', { ascending: false }).limit(2000);
      return (data || []) as Contact[];
    },
    enabled: !!churchId,
  });

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

  // Get cells sorted by distance to a contact
  const getCellsByDistance = useCallback((contact: Contact, filterZona?: Zona | null): Cell[] => {
    if (!cells?.length) return [];
    let candidates = cells;
    if (filterZona && cuerdas?.length) {
      const zonaCuerdaIds = cuerdas.filter(c => c.zona_id === filterZona.id).map(c => c.id);
      const zonaCells = cells.filter(c => c.cuerda_id && zonaCuerdaIds.includes(c.cuerda_id));
      if (zonaCells.length > 0) candidates = zonaCells;
    }

    // If contact has no lat/lng, just return candidates as-is
    // For now we use barrio/address text matching as the "distance" proxy
    // Real distance would require geocoding the contact address
    const cellsWithScore = candidates.map(cell => {
      let score = 999;
      // If both have coordinates, use real distance
      if (contact.lat && contact.lng && cell.lat && cell.lng) {
        score = haversine(contact.lat, contact.lng, cell.lat, cell.lng);
      } else {
        // Text-based proximity: check if contact address/barrio matches cell address
        const contactText = normalize((contact.address || '') + ' ' + (contact.barrio || ''));
        const cellText = normalize(cell.address || '');
        if (cellText && contactText) {
          // Simple heuristic: shared words
          const contactWords = new Set(contactText.split(/\s+/).filter(w => w.length > 2));
          const cellWords = cellText.split(/\s+/).filter(w => w.length > 2);
          const shared = cellWords.filter(w => contactWords.has(w)).length;
          score = shared > 0 ? (100 - shared * 10) : 500;
        }
      }
      return { cell, score };
    });

    return cellsWithScore.sort((a, b) => a.score - b.score).map(x => x.cell);
  }, [cells, cuerdas]);

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
  const poolCounts = useMemo(() => {
    let unassigned = 0;
    allContacts?.forEach(c => {
      if (!c.zona_id && !c.cell_id) unassigned++;
    });
    return { unassigned };
  }, [allContacts]);

  const externalContacts = useMemo(() => {
    if (!allContacts || !homeZonaId) return [];
    return allContacts.filter(c => {
      if (c.zona_id || c.cell_id) return false;
      const sug = suggestions[c.id];
      return sug?.zona && sug.zona.id !== homeZonaId;
    });
  }, [allContacts, homeZonaId, suggestions]);

  // ─── Filtered contacts ─────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered: Contact[];
    if (activePool === 'unassigned') filtered = allContacts.filter(c => !c.zona_id && !c.cell_id);
    else if (activePool === 'external') filtered = externalContacts;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        (c.first_name || '').toLowerCase().includes(s) || (c.last_name || '').toLowerCase().includes(s) ||
        (c.address || '').toLowerCase().includes(s) || (c.barrio || '').toLowerCase().includes(s)
      );
    }
    return filtered;
  }, [allContacts, activePool, searchTerm, externalContacts]);

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
          <h1 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Pool de Contactos</h1>
          <p className="text-muted-foreground text-xs mt-1">Asignación de contactos a células por cercanía</p>
        </div>
        {undoData && (
          <Button variant="outline" size="sm" onClick={() => undoMutation.mutate()} disabled={undoMutation.isPending} className="gap-1.5">
            <Undo2 className="h-4 w-4" /> Deshacer ({undoData.contactIds.length})
          </Button>
        )}
      </div>

      {/* Pool Cards — only Sin asignar + Pool externo */}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Card className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'unassigned' ? 'ring-2 ring-primary' : ''}`} onClick={() => { setActivePool('unassigned'); setSearchTerm(''); }}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Sin asignar</p>
                <p className={`text-2xl font-bold tabular-nums ${poolCounts.unassigned > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : poolCounts.unassigned}</p>
              </div>
              {poolCounts.unassigned > 0 && <AlertCircle className="h-6 w-6 text-yellow-500 opacity-70" />}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'external' ? 'ring-2 ring-orange-500' : ''} ${externalContacts.length > 0 ? 'border-orange-500/30' : ''}`} onClick={() => { setActivePool('external'); setSearchTerm(''); }}>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-orange-400">Pool externo</p>
                <p className={`text-2xl font-bold tabular-nums ${externalContacts.length > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>{isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : externalContacts.length}</p>
              </div>
              {externalContacts.length > 0 && <ExternalLink className="h-5 w-5 text-orange-400 opacity-70" />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {activePool === 'unassigned' && isAdminOrPastor && poolCounts.unassigned > 0 && (
          <Button size="sm" onClick={() => setConfirmDialog({ type: 'auto', preview: autoAssignPreview })} className="gap-1.5">
            <Zap className="h-4 w-4" /> Autoasignar todos ({poolCounts.unassigned})
          </Button>
        )}
        {isAdminOrPastor && (
          <Button variant="outline" size="sm" onClick={() => setCsvDialogOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar CSV
          </Button>
        )}
        <div className="flex-1" />
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : !filteredContacts.length ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              {searchTerm ? 'Sin resultados.' : activePool === 'unassigned' ? 'Todos asignados ✅' : 'Pool externo vacío.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <ResizableHeader width={colWidths.nombre} onResize={resizeCol('nombre')}>Nombre</ResizableHeader>
                    <ResizableHeader width={colWidths.apellido} onResize={resizeCol('apellido')}>Apellido</ResizableHeader>
                    <ResizableHeader width={colWidths.edad} onResize={resizeCol('edad')} className="text-center">Edad</ResizableHeader>
                    <ResizableHeader width={colWidths.direccion} onResize={resizeCol('direccion')}>Dirección</ResizableHeader>
                    {isUnassignedView && isAdminOrPastor && <ResizableHeader width={colWidths.asignar} onResize={resizeCol('asignar')}>Asignar</ResizableHeader>}
                    {isUnassignedView && <ResizableHeader width={colWidths.celulaSug} onResize={resizeCol('celulaSug')}>Célula sug.</ResizableHeader>}
                    {isUnassignedView && <ResizableHeader width={colWidths.zonaSug} onResize={resizeCol('zonaSug')}>Zona sug.</ResizableHeader>}
                    {!isUnassignedView && <ResizableHeader width={colWidths.cuerda} onResize={resizeCol('cuerda')}>Cuerda</ResizableHeader>}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(c => {
                    const sug = suggestions[c.id];
                    const sugCell = sug?.cell;
                    const sugCuerda = sug?.cuerda;
                    const sugZona = sug?.zona;
                    const hasAddress = !!(c.address || c.barrio);
                    const isExternal = sugZona && homeZonaId && sugZona.id !== homeZonaId;

                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-2.5 text-sm font-medium" style={{ width: colWidths.nombre }}>
                          <button className="hover:underline text-left" onClick={() => setSelectedContactId(c.id)}>{c.first_name}</button>
                        </td>
                        <td className="px-3 py-2.5 text-sm" style={{ width: colWidths.apellido }}>
                          <button className="hover:underline text-left" onClick={() => setSelectedContactId(c.id)}>{c.last_name || '—'}</button>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-center text-muted-foreground tabular-nums" style={{ width: colWidths.edad }}>{c.edad || '—'}</td>
                        <td className="px-3 py-2.5" style={{ width: colWidths.direccion }}>
                          <span className="text-xs block truncate">{c.address || '—'}</span>
                          {c.barrio && <span className="text-[11px] text-muted-foreground">{c.barrio}</span>}
                        </td>

                        {/* Assign button */}
                        {isUnassignedView && isAdminOrPastor && (
                          <td className="px-3 py-2.5" style={{ width: colWidths.asignar }}>
                            {!hasAddress ? (
                              <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600/30 cursor-help">Sin dirección</Badge></TooltipTrigger>
                                <TooltipContent><p className="text-xs">Completá la dirección para asignar.</p></TooltipContent></Tooltip>
                            ) : (
                              <div className="flex items-center gap-1">
                                {/* Quick auto-assign button */}
                                {sugCell && (
                                  <Button variant="default" size="sm" className="h-7 text-[11px] px-2" onClick={() => setConfirmDialog({
                                    type: 'manual', contactId: c.id, cellId: sugCell.id, cellName: sugCell.name,
                                    cuerdaNum: sugCuerda?.numero, zonaName: sugZona?.nombre,
                                  })}>
                                    <Zap className="h-3 w-3 mr-1" /> Asignar
                                  </Button>
                                )}
                                {/* Dropdown for manual selection */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-1.5"><ChevronDown className="h-3 w-3" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-64 max-h-[340px] overflow-y-auto">
                                    {(() => {
                                      const { inZone, otherZone } = getCellDropdownItems(c);
                                      return (
                                        <>
                                          {inZone.length > 0 && (
                                            <>
                                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">Células cercanas (misma zona)</DropdownMenuLabel>
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
                                          {inZone.length === 0 && otherZone.length === 0 && (
                                            <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin células disponibles</DropdownMenuItem>
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

                        {/* Célula sug. + Zona sug. */}
                        {isUnassignedView && (
                          <>
                            <td className="px-3 py-2.5" style={{ width: colWidths.celulaSug }}>
                              {sugCell ? (
                                <div>
                                  <Badge className={`text-[11px] ${isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15'}`}>
                                    {sugCell.name}
                                  </Badge>
                                  {sugCuerda && <span className="text-[10px] text-muted-foreground ml-1 font-mono">#{sugCuerda.numero}</span>}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5" style={{ width: colWidths.zonaSug }}>
                              {sugZona ? (
                                <Badge className={`text-[11px] ${isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15'}`}>
                                  {sugZona.nombre}
                                  {isExternal && <ExternalLink className="h-3 w-3 ml-1 inline" />}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground">Sin datos</span>}
                            </td>
                          </>
                        )}

                        {!isUnassignedView && (
                          <td className="px-3 py-2.5" style={{ width: colWidths.cuerda }}>
                            {c.numero_cuerda ? <Badge variant="secondary" className="text-xs font-mono">{c.numero_cuerda}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
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

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Total: {allContacts?.length || 0}</span>
        <span>Sin asignar: {poolCounts.unassigned}</span>
        <span>Externo: {externalContacts.length}</span>
        <span>Mostrando: {filteredContacts.length}</span>
      </div>

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
              onClick={() => {
                if (confirmDialog?.type === 'auto') autoAssignMutation.mutate();
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
            <DialogTitle>Importar Contactos desde CSV</DialogTitle>
            <DialogDescription>
              Los contactos importados aparecerán en el pool "Sin asignar" para que puedas verificar sus direcciones y asignarles una célula.
            </DialogDescription>
          </DialogHeader>
          <CsvImporter
            tableName="contacts"
            requiredFields={CONTACT_FIELDS.filter(f => f.key === 'first_name')}
            optionalFields={CONTACT_FIELDS.filter(f => f.key !== 'first_name')}
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
            queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
          }
        }}
        contactId={selectedContactId || ''}
        churchId={churchId!}
      />
    </div>
  );
};

export default PoolPage;
