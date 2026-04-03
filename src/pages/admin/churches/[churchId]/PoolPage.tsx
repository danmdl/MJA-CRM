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
  Users, AlertCircle, Search, Undo2, ChevronDown, Zap, ExternalLink,
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';

// ─── Types ───────────────────────────────────────────────────────
interface Zona { id: string; nombre: string; }
interface Barrio { id: string; nombre: string; zona_id: string; }
interface Cuerda { id: string; numero: string; zona_id: string; }

interface Contact {
  id: string; first_name: string; last_name: string | null;
  phone: string | null; address: string | null; barrio: string | null;
  zona_id: string | null; zona?: string | null;
  conector: string | null; fecha_contacto: string | null;
  numero_cuerda: string | null; edad: string | null;
}

// ─── Accent-insensitive normalize ────────────────────────────────
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ─── Hardcoded cuerda→zona map (fallback when DB barrios are empty) ─
const CUERDA_ZONA_FALLBACK: Record<string, string> = {
  '101': 'San Martin', '201': 'San Martin',
  '102': 'Villa Lynch', '202': 'Villa Lynch',
  '103': 'Ballester', '203': 'Ballester',
  '110': 'Gregoria Matorras', '210': 'Gregoria Matorras',
  '104': 'Villa Maipu', '204': 'Villa Maipu',
  '105': 'Loma Hermosa', '205': 'Loma Hermosa',
  '106': 'Jose L. Suarez', '206': 'Jose L. Suarez',
  '107': 'Santos Lugares', '207': 'Santos Lugares',
  '108': 'Billinghurst', '208': 'Billinghurst',
  '109': 'Caseros', '209': 'Caseros',
  '301': 'Bonich', '302': 'Bonich',
};

// ─── Resizable Table Header ──────────────────────────────────────
const ResizableHeader = ({
  children,
  width,
  onResize,
  className = '',
}: {
  children: React.ReactNode;
  width: number;
  onResize: (delta: number) => void;
  className?: string;
}) => {
  const startX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    const onMove = (ev: MouseEvent) => {
      onResize(ev.clientX - startX.current);
      startX.current = ev.clientX;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <th
      className={`relative text-left text-xs font-medium text-muted-foreground px-3 py-2 select-none ${className}`}
      style={{ width, minWidth: 60 }}
    >
      {children}
      <div
        onMouseDown={onMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors"
      />
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
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'auto' | 'manual';
    contactId?: string;
    zonaId?: string;
    zonaName?: string;
    cuerdaNum?: string;
    preview?: { zona: string; count: number }[];
  } | null>(null);
  const [undoData, setUndoData] = useState<{
    contactIds: string[];
    prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null }[];
  } | null>(null);

  // Resizable column widths
  const [colWidths, setColWidths] = useState({
    nombre: 160,
    apellido: 140,
    edad: 60,
    direccion: 220,
    asignar: 120,
    cuerdaSug: 110,
    zonaSug: 130,
    cuerda: 100,
  });

  const resizeCol = (col: keyof typeof colWidths) => (delta: number) => {
    setColWidths(prev => ({ ...prev, [col]: Math.max(60, prev[col] + delta) }));
  };

  const isAdminOrPastor = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';

  // ─── Data Fetching ───────────────────────────────────────────
  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!).order('nombre');
      return data || [];
    },
    enabled: !!churchId,
  });

  const { data: barrios } = useQuery<Barrio[]>({
    queryKey: ['barrios', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const zonaIds = zonas.map(z => z.id);
      const { data } = await supabase.from('barrios').select('id, nombre, zona_id').in('zona_id', zonaIds);
      return data || [];
    },
    enabled: !!zonas?.length,
  });

  const { data: cuerdas } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const zonaIds = zonas.map(z => z.id);
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id').in('zona_id', zonaIds);
      return data || [];
    },
    enabled: !!zonas?.length,
  });

  // Fetch ALL contacts for real counts
  const { data: allContacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-all-contacts', churchId],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, phone, address, barrio, zona_id, zona, conector, fecha_contacto, numero_cuerda, edad')
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

  // ─── Zona detection (accent-insensitive) ───────────────────────
  const detectZonaForContact = useCallback((contact: Contact): Zona | null => {
    if (!zonas?.length) return null;
    const text = normalize((contact.barrio || '') + ' ' + (contact.address || ''));
    if (!text.trim()) return null;

    // 1. Match against barrios table (accent-insensitive)
    if (barrios?.length) {
      for (const barrio of barrios) {
        if (text.includes(normalize(barrio.nombre))) {
          return zonas.find(z => z.id === barrio.zona_id) || null;
        }
      }
    }

    // 2. Match against zona name directly (accent-insensitive)
    const zonaMatch = zonas.find(z => text.includes(normalize(z.nombre)));
    if (zonaMatch) return zonaMatch;

    // 3. Fallback: hardcoded map — check if barrio text matches any known zona name
    for (const [, zonaName] of Object.entries(CUERDA_ZONA_FALLBACK)) {
      if (text.includes(normalize(zonaName))) {
        return zonas.find(z => normalize(z.nombre) === normalize(zonaName)) || null;
      }
    }

    return null;
  }, [zonas, barrios]);

  const detectCuerdaForContact = useCallback((_contact: Contact, suggestedZona: Zona | null): Cuerda | null => {
    if (!suggestedZona || !cuerdas?.length) return null;
    const zonaCuerdas = cuerdas.filter(c => c.zona_id === suggestedZona.id).sort((a, b) => a.numero.localeCompare(b.numero));
    return zonaCuerdas[0] || null;
  }, [cuerdas]);

  // Determine the "home" zona for this church (the one with the most assigned contacts)
  const homeZonaId = useMemo(() => {
    if (!allContacts?.length || !zonas?.length) return null;
    const counts: Record<string, number> = {};
    allContacts.forEach(c => {
      if (c.zona_id) counts[c.zona_id] = (counts[c.zona_id] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || zonas[0]?.id || null;
  }, [allContacts, zonas]);

  // ─── Pool counts + external detection ──────────────────────────
  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = { unassigned: 0, external: 0 };
    zonas?.forEach(z => { counts[z.id] = 0; });
    allContacts?.forEach(c => {
      if (!c.zona_id) counts.unassigned++;
      else if (counts[c.zona_id] !== undefined) counts[c.zona_id]++;
    });
    return counts;
  }, [allContacts, zonas]);

  // Count contacts whose SUGGESTED zona differs from home zona (external pool)
  const externalContacts = useMemo(() => {
    if (!allContacts || !homeZonaId) return [];
    return allContacts.filter(c => {
      if (c.zona_id) return false; // already assigned
      const sug = detectZonaForContact(c);
      return sug && sug.id !== homeZonaId;
    });
  }, [allContacts, homeZonaId, detectZonaForContact]);

  // ─── Suggestions map ──────────────────────────────────────────
  const suggestions = useMemo(() => {
    const map: Record<string, { zona: Zona | null; cuerda: Cuerda | null }> = {};
    allContacts?.forEach(c => {
      if (!c.zona_id) {
        const sugZona = detectZonaForContact(c);
        const sugCuerda = detectCuerdaForContact(c, sugZona);
        map[c.id] = { zona: sugZona, cuerda: sugCuerda };
      }
    });
    return map;
  }, [allContacts, detectZonaForContact, detectCuerdaForContact]);

  // ─── Filtered contacts ────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered: Contact[];
    if (activePool === 'unassigned') {
      filtered = allContacts.filter(c => !c.zona_id);
    } else if (activePool === 'external') {
      filtered = externalContacts;
    } else {
      filtered = allContacts.filter(c => c.zona_id === activePool);
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        (c.first_name || '').toLowerCase().includes(s) ||
        (c.last_name || '').toLowerCase().includes(s) ||
        (c.address || '').toLowerCase().includes(s) ||
        (c.barrio || '').toLowerCase().includes(s)
      );
    }
    return filtered;
  }, [allContacts, activePool, searchTerm, externalContacts]);

  // ─── Auto-assign preview ──────────────────────────────────────
  const autoAssignPreview = useMemo(() => {
    const counts: Record<string, number> = {};
    let noMatch = 0;
    let external = 0;
    allContacts?.forEach(c => {
      if (c.zona_id) return;
      const sug = suggestions[c.id];
      if (sug?.zona) {
        counts[sug.zona.nombre] = (counts[sug.zona.nombre] || 0) + 1;
        if (homeZonaId && sug.zona.id !== homeZonaId) external++;
      } else {
        noMatch++;
      }
    });
    const result = Object.entries(counts).map(([zona, count]) => ({ zona, count })).sort((a, b) => b.count - a.count);
    if (external > 0) result.push({ zona: '⚠️ Irán a pool externo (otra zona)', count: external });
    if (noMatch > 0) result.push({ zona: '❌ Sin coincidencia (no se asignarán)', count: noMatch });
    return result;
  }, [allContacts, suggestions, homeZonaId]);

  // ─── Mutations ────────────────────────────────────────────────
  const assignSingleMutation = useMutation({
    mutationFn: async ({ contactId, zonaId, cuerdaNum }: { contactId: string; zonaId: string; cuerdaNum?: string }) => {
      const zona = zonas?.find(z => z.id === zonaId);
      const contact = allContacts?.find(c => c.id === contactId);
      const updateData: Record<string, any> = {
        zona_id: zonaId,
        zona: zona?.nombre || null,
        pool_assigned_at: new Date().toISOString(),
        pool_assigned_by: session?.user?.id,
      };
      if (cuerdaNum) updateData.numero_cuerda = cuerdaNum;
      const { error } = await supabase.from('contacts').update(updateData).eq('id', contactId);
      if (error) throw error;
      setUndoData({
        contactIds: [contactId],
        prevStates: [{
          zona_id: contact?.zona_id || null,
          zona: contact?.zona || null,
          numero_cuerda: contact?.numero_cuerda || null,
        }],
      });
    },
    onSuccess: () => {
      showSuccess('Contacto asignado.');
      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
      setConfirmDialog(null);
    },
    onError: (err: any) => showError(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!allContacts || !zonas) return 0;
      const assignments: { id: string; zona_id: string; zona_nombre: string; cuerda?: string }[] = [];
      const prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null }[] = [];
      const ids: string[] = [];

      for (const contact of allContacts) {
        if (contact.zona_id) continue;
        const sug = suggestions[contact.id];
        if (sug?.zona) {
          assignments.push({ id: contact.id, zona_id: sug.zona.id, zona_nombre: sug.zona.nombre, cuerda: sug.cuerda?.numero });
          ids.push(contact.id);
          prevStates.push({ zona_id: contact.zona_id, zona: contact.zona || null, numero_cuerda: contact.numero_cuerda });
        }
      }

      if (assignments.length === 0) throw new Error('No se pudo detectar la zona de ningún contacto.');

      for (const a of assignments) {
        const updateData: Record<string, any> = {
          zona_id: a.zona_id,
          zona: a.zona_nombre,
          pool_assigned_at: new Date().toISOString(),
          pool_assigned_by: session?.user?.id,
        };
        if (a.cuerda) updateData.numero_cuerda = a.cuerda;
        await supabase.from('contacts').update(updateData).eq('id', a.id);
      }

      setUndoData({ contactIds: ids, prevStates });
      return assignments.length;
    },
    onSuccess: (count) => {
      showSuccess(`${count} contacto(s) asignados automáticamente.`);
      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
      setConfirmDialog(null);
    },
    onError: (err: any) => showError(err.message || 'No se pudo auto-asignar.'),
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!undoData) return;
      for (let i = 0; i < undoData.contactIds.length; i++) {
        const prev = undoData.prevStates[i];
        await supabase.from('contacts').update({
          zona_id: prev.zona_id,
          zona: prev.zona,
          numero_cuerda: prev.numero_cuerda,
          pool_assigned_at: null,
          pool_assigned_by: null,
        }).eq('id', undoData.contactIds[i]);
      }
    },
    onSuccess: () => {
      showSuccess('Asignación deshecha.');
      setUndoData(null);
      queryClient.invalidateQueries({ queryKey: ['pool-all-contacts', churchId] });
    },
    onError: (err: any) => showError(err.message),
  });

  // ─── Cuerdas grouped by zona ──────────────────────────────────
  const cuerdaMenuItems = useMemo(() => {
    if (!zonas?.length || !cuerdas?.length) return [];
    return zonas.map(zona => {
      const zonaCuerdas = cuerdas.filter(c => c.zona_id === zona.id).sort((a, b) => a.numero.localeCompare(b.numero));
      return { zona, cuerdas: zonaCuerdas };
    }).filter(g => g.cuerdas.length > 0);
  }, [zonas, cuerdas]);

  const isUnassignedView = activePool === 'unassigned' || activePool === 'external';

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> Pool de Contactos por Zona
          </h1>
          <p className="text-muted-foreground text-xs mt-1">
            Asignación de contactos a zonas después de la jornada de conexión
          </p>
        </div>
        {undoData && (
          <Button
            variant="outline" size="sm"
            onClick={() => undoMutation.mutate()}
            disabled={undoMutation.isPending}
            className="gap-1.5"
          >
            <Undo2 className="h-4 w-4" />
            Deshacer ({undoData.contactIds.length})
          </Button>
        )}
      </div>

      {/* ─── Pool Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {/* Sin asignar */}
        <Card
          className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'unassigned' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => { setActivePool('unassigned'); setSearchTerm(''); }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Sin asignar</p>
                <p className={`text-2xl font-bold tabular-nums ${poolCounts.unassigned > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                  {isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : poolCounts.unassigned}
                </p>
              </div>
              {poolCounts.unassigned > 0 && <AlertCircle className="h-6 w-6 text-yellow-500 opacity-70" />}
            </div>
          </CardContent>
        </Card>

        {/* Zona cards */}
        {zonas?.map(zona => (
          <Card
            key={zona.id}
            className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === zona.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => { setActivePool(zona.id); setSearchTerm(''); }}
          >
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-[11px] text-muted-foreground truncate">{zona.nombre}</p>
              <p className="text-2xl font-bold tabular-nums">
                {isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : (poolCounts[zona.id] || 0)}
              </p>
            </CardContent>
          </Card>
        ))}

        {/* Pool externo */}
        <Card
          className={`cursor-pointer transition-all hover:border-foreground/20 ${activePool === 'external' ? 'ring-2 ring-orange-500' : ''} ${externalContacts.length > 0 ? 'border-orange-500/30' : ''}`}
          onClick={() => { setActivePool('external'); setSearchTerm(''); }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-orange-400">Pool externo</p>
                <p className={`text-2xl font-bold tabular-nums ${externalContacts.length > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {isLoading ? <Skeleton className="h-7 w-8 inline-block" /> : externalContacts.length}
                </p>
              </div>
              {externalContacts.length > 0 && <ExternalLink className="h-5 w-5 text-orange-400 opacity-70" />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {activePool === 'unassigned' && isAdminOrPastor && poolCounts.unassigned > 0 && (
          <Button
            size="sm"
            onClick={() => setConfirmDialog({ type: 'auto', preview: autoAssignPreview })}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" />
            Autoasignar todos ({poolCounts.unassigned})
          </Button>
        )}
        <div className="flex-1" />
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Buscar por nombre o dirección..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ─── Table ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !filteredContacts.length ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              {searchTerm
                ? 'Sin resultados para esta búsqueda.'
                : activePool === 'unassigned'
                  ? 'Todos los contactos están asignados a una zona ✅'
                  : activePool === 'external'
                    ? 'No hay contactos en el pool externo.'
                    : 'No hay contactos en esta zona todavía.'}
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
                    {isUnassignedView && isAdminOrPastor && (
                      <ResizableHeader width={colWidths.asignar} onResize={resizeCol('asignar')}>Asignar</ResizableHeader>
                    )}
                    {isUnassignedView && (
                      <>
                        <ResizableHeader width={colWidths.cuerdaSug} onResize={resizeCol('cuerdaSug')}>Cuerda sug.</ResizableHeader>
                        <ResizableHeader width={colWidths.zonaSug} onResize={resizeCol('zonaSug')}>Zona sug.</ResizableHeader>
                      </>
                    )}
                    {!isUnassignedView && (
                      <ResizableHeader width={colWidths.cuerda} onResize={resizeCol('cuerda')}>Cuerda</ResizableHeader>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(c => {
                    const sug = suggestions[c.id];
                    const sugZona = sug?.zona || null;
                    const sugCuerda = sug?.cuerda || null;
                    const hasAddress = !!(c.address || c.barrio);
                    const isExternal = sugZona && homeZonaId && sugZona.id !== homeZonaId;

                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-2.5 text-sm font-medium" style={{ width: colWidths.nombre }}>{c.first_name}</td>
                        <td className="px-3 py-2.5 text-sm" style={{ width: colWidths.apellido }}>{c.last_name || '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-center text-muted-foreground tabular-nums" style={{ width: colWidths.edad }}>{c.edad || '—'}</td>
                        <td className="px-3 py-2.5" style={{ width: colWidths.direccion }}>
                          <span className="text-xs block truncate">{c.address || '—'}</span>
                          {c.barrio && <span className="text-[11px] text-muted-foreground">{c.barrio}</span>}
                        </td>

                        {/* Assign button */}
                        {isUnassignedView && isAdminOrPastor && (
                          <td className="px-3 py-2.5" style={{ width: colWidths.asignar }}>
                            {!hasAddress ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600/30 cursor-help">
                                    Sin dirección
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Completá la dirección para poder asignar.</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2.5">
                                    Asignar <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 max-h-[320px] overflow-y-auto">
                                  {/* Quick-assign to suggestion */}
                                  {sugZona && sugCuerda && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => setConfirmDialog({
                                          type: 'manual', contactId: c.id,
                                          zonaId: sugZona.id, zonaName: sugZona.nombre,
                                          cuerdaNum: sugCuerda.numero,
                                        })}
                                        className="text-xs font-medium"
                                      >
                                        <Zap className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                                        ⚡ {sugZona.nombre} · Cuerda {sugCuerda.numero}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  {sugZona && !sugCuerda && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => setConfirmDialog({
                                          type: 'manual', contactId: c.id,
                                          zonaId: sugZona.id, zonaName: sugZona.nombre,
                                        })}
                                        className="text-xs font-medium"
                                      >
                                        <Zap className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                                        ⚡ {sugZona.nombre}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  {/* All cuerdas grouped by zona */}
                                  {cuerdaMenuItems.map(({ zona, cuerdas: zc }) => (
                                    <React.Fragment key={zona.id}>
                                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">
                                        {zona.nombre}
                                      </DropdownMenuLabel>
                                      {zc.map(cuerda => (
                                        <DropdownMenuItem
                                          key={cuerda.id}
                                          className="text-xs pl-5"
                                          onClick={() => setConfirmDialog({
                                            type: 'manual', contactId: c.id,
                                            zonaId: zona.id, zonaName: zona.nombre,
                                            cuerdaNum: cuerda.numero,
                                          })}
                                        >
                                          Cuerda {cuerda.numero}
                                        </DropdownMenuItem>
                                      ))}
                                    </React.Fragment>
                                  ))}
                                  {/* Zona only */}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">
                                    Solo zona (sin cuerda)
                                  </DropdownMenuLabel>
                                  {zonas?.map(z => (
                                    <DropdownMenuItem
                                      key={`zo-${z.id}`}
                                      className="text-xs pl-5"
                                      onClick={() => setConfirmDialog({
                                        type: 'manual', contactId: c.id,
                                        zonaId: z.id, zonaName: z.nombre,
                                      })}
                                    >
                                      {z.nombre}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        )}

                        {/* Cuerda sug. + Zona sug. */}
                        {isUnassignedView && (
                          <>
                            <td className="px-3 py-2.5" style={{ width: colWidths.cuerdaSug }}>
                              {sugCuerda ? (
                                <Badge className={`text-xs font-mono ${isExternal ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15' : 'bg-green-500/15 text-green-500 hover:bg-green-500/15'}`}>
                                  {sugCuerda.numero}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5" style={{ width: colWidths.zonaSug }}>
                              {sugZona ? (
                                <Badge className={`text-[11px] ${isExternal
                                  ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/15'
                                  : 'bg-green-500/15 text-green-500 hover:bg-green-500/15'
                                }`}>
                                  {sugZona.nombre}
                                  {isExternal && <ExternalLink className="h-3 w-3 ml-1 inline" />}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground">Sin datos</span>}
                            </td>
                          </>
                        )}

                        {/* Cuerda for assigned */}
                        {!isUnassignedView && (
                          <td className="px-3 py-2.5" style={{ width: colWidths.cuerda }}>
                            {c.numero_cuerda ? (
                              <Badge variant="secondary" className="text-xs font-mono">{c.numero_cuerda}</Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
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
        <span>Pool externo: {externalContacts.length}</span>
        <span>Mostrando: {filteredContacts.length}</span>
      </div>

      {/* ─── Confirmation Dialog ────────────────────────────────── */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'auto' ? 'Autoasignar contactos' : 'Confirmar asignación'}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {confirmDialog?.type === 'auto' ? (
                  <>
                    <p>Se asignarán los contactos según su dirección y barrio a la zona correspondiente.</p>
                    {confirmDialog.preview && confirmDialog.preview.length > 0 && (
                      <div className="mt-3 space-y-1 border rounded-md p-3 bg-muted/50">
                        <p className="text-xs font-medium text-foreground mb-2">Vista previa:</p>
                        {confirmDialog.preview.map(p => (
                          <div key={p.zona} className="flex justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                            <span>{p.zona}</span>
                            <span className="font-mono font-medium tabular-nums">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    ¿Asignar este contacto a <strong>{confirmDialog?.zonaName}</strong>
                    {confirmDialog?.cuerdaNum && <> (Cuerda <strong>{confirmDialog.cuerdaNum}</strong>)</>}?
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (confirmDialog?.type === 'auto') {
                  autoAssignMutation.mutate();
                } else if (confirmDialog?.contactId && confirmDialog?.zonaId) {
                  assignSingleMutation.mutate({
                    contactId: confirmDialog.contactId,
                    zonaId: confirmDialog.zonaId,
                    cuerdaNum: confirmDialog.cuerdaNum,
                  });
                }
              }}
              disabled={autoAssignMutation.isPending || assignSingleMutation.isPending}
            >
              {(autoAssignMutation.isPending || assignSingleMutation.isPending) ? 'Asignando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PoolPage;
