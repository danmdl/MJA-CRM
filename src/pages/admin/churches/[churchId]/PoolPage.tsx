"use client";
import React, { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  Users, AlertCircle, Search, Undo2, ChevronDown, Zap,
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
  const [undoData, setUndoData] = useState<{ contactIds: string[]; prevStates: { zona_id: string | null; zona: string | null; numero_cuerda: string | null }[] } | null>(null);

  const isAdminOrPastor = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor';

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

  // Fetch ALL contacts so we can show correct counts on all pool cards
  const { data: allContacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['pool-all-contacts', churchId],
    queryFn: async () => {
      let q = supabase.from('contacts')
        .select('id, first_name, last_name, phone, address, barrio, zona_id, zona, conector, fecha_contacto, numero_cuerda, edad')
        .eq('church_id', churchId!);
      if (profile?.role === 'user') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) q = q.eq('created_by', user.id);
      }
      const { data } = await q.order('fecha_contacto', { ascending: false }).limit(2000);
      return (data || []) as Contact[];
    },
    enabled: !!churchId,
  });

  // ─── Zona detection ───────────────────────────────────────────
  const detectZonaForContact = useCallback((contact: Contact): Zona | null => {
    if (!zonas?.length) return null;
    const text = ((contact.barrio || '') + ' ' + (contact.address || '')).toLowerCase();
    if (!text.trim()) return null;
    // Match against barrios table first (more specific)
    if (barrios?.length) {
      for (const barrio of barrios) {
        if (text.includes(barrio.nombre.toLowerCase())) {
          return zonas.find(z => z.id === barrio.zona_id) || null;
        }
      }
    }
    // Fallback: match zona name directly
    return zonas.find(z => text.includes(z.nombre.toLowerCase())) || null;
  }, [zonas, barrios]);

  const detectCuerdaForContact = useCallback((_contact: Contact, suggestedZona: Zona | null): Cuerda | null => {
    if (!suggestedZona || !cuerdas?.length) return null;
    const zonaCuerdas = cuerdas.filter(c => c.zona_id === suggestedZona.id);
    return zonaCuerdas[0] || null;
  }, [cuerdas]);

  // ─── Pool counts ──────────────────────────────────────────────
  const poolCounts = useMemo(() => {
    const counts: Record<string, number> = { unassigned: 0 };
    zonas?.forEach(z => { counts[z.id] = 0; });
    allContacts?.forEach(c => {
      if (!c.zona_id) counts.unassigned++;
      else if (counts[c.zona_id] !== undefined) counts[c.zona_id]++;
    });
    return counts;
  }, [allContacts, zonas]);

  // ─── Filtered contacts ────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    if (!allContacts) return [];
    let filtered = activePool === 'unassigned'
      ? allContacts.filter(c => !c.zona_id)
      : allContacts.filter(c => c.zona_id === activePool);
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
  }, [allContacts, activePool, searchTerm]);

  // ─── Suggestions ──────────────────────────────────────────────
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

  // ─── Auto-assign preview ──────────────────────────────────────
  const autoAssignPreview = useMemo(() => {
    const counts: Record<string, number> = {};
    let noMatch = 0;
    allContacts?.forEach(c => {
      if (c.zona_id) return;
      const sug = suggestions[c.id];
      if (sug?.zona) {
        counts[sug.zona.nombre] = (counts[sug.zona.nombre] || 0) + 1;
      } else {
        noMatch++;
      }
    });
    const result = Object.entries(counts).map(([zona, count]) => ({ zona, count })).sort((a, b) => b.count - a.count);
    if (noMatch > 0) result.push({ zona: 'Sin coincidencia (no se asignarán)', count: noMatch });
    return result;
  }, [allContacts, suggestions]);

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
      // Save undo state
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

  // ─── Cuerdas grouped by zona for dropdown ─────────────────────
  const cuerdaMenuItems = useMemo(() => {
    if (!zonas?.length || !cuerdas?.length) return [];
    return zonas.map(zona => {
      const zonaCuerdas = cuerdas.filter(c => c.zona_id === zona.id).sort((a, b) => a.numero.localeCompare(b.numero));
      return { zona, cuerdas: zonaCuerdas };
    }).filter(g => g.cuerdas.length > 0);
  }, [zonas, cuerdas]);

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
                  : 'No hay contactos en esta zona todavía.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Nombre</TableHead>
                    <TableHead className="min-w-[100px]">Apellido</TableHead>
                    <TableHead className="w-16 text-center">Edad</TableHead>
                    <TableHead className="min-w-[180px]">Dirección</TableHead>
                    {activePool === 'unassigned' && isAdminOrPastor && (
                      <TableHead className="w-32">Asignar</TableHead>
                    )}
                    {activePool === 'unassigned' && (
                      <>
                        <TableHead className="w-28">Cuerda sug.</TableHead>
                        <TableHead className="w-28">Zona sug.</TableHead>
                      </>
                    )}
                    {activePool !== 'unassigned' && (
                      <TableHead className="w-24">Cuerda</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map(c => {
                    const sug = suggestions[c.id];
                    const sugZona = sug?.zona;
                    const sugCuerda = sug?.cuerda;
                    const hasAddress = !!(c.address || c.barrio);

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.first_name}</TableCell>
                        <TableCell>{c.last_name || '—'}</TableCell>
                        <TableCell className="text-center text-muted-foreground tabular-nums">{c.edad || '—'}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="text-xs truncate block">{c.address || '—'}</span>
                          {c.barrio && <span className="text-[11px] text-muted-foreground">{c.barrio}</span>}
                        </TableCell>

                        {activePool === 'unassigned' && isAdminOrPastor && (
                          <TableCell>
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
                                  {sugZona && sugCuerda && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => setConfirmDialog({
                                          type: 'manual', contactId: c.id,
                                          zonaId: sugZona.id, zonaName: sugZona.nombre,
                                          cuerdaNum: sugCuerda.numero,
                                        })}
                                        className="text-xs"
                                      >
                                        <Zap className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                                        {sugZona.nombre} · Cuerda {sugCuerda.numero}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
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
                          </TableCell>
                        )}

                        {activePool === 'unassigned' && (
                          <>
                            <TableCell>
                              {sugCuerda ? (
                                <Badge variant="secondary" className="text-xs font-mono">{sugCuerda.numero}</Badge>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {sugZona ? (
                                <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/15 text-[11px]">{sugZona.nombre}</Badge>
                              ) : <span className="text-xs text-muted-foreground">Sin datos</span>}
                            </TableCell>
                          </>
                        )}

                        {activePool !== 'unassigned' && (
                          <TableCell>
                            {c.numero_cuerda ? (
                              <Badge variant="secondary" className="text-xs font-mono">{c.numero_cuerda}</Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Total: {allContacts?.length || 0}</span>
        <span>Sin asignar: {poolCounts.unassigned}</span>
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
