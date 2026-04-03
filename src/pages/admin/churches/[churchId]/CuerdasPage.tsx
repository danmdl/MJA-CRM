"use client";
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/utils/toast';
import {
  ChevronDown, ChevronRight, MapPin, Clock, Users, UserCheck, Home,
  Upload, Search, PlusCircle, MoreHorizontal, Trash2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import AddCellDialog from '@/components/admin/AddCellDialog';
import CellDetailsDialog from '@/components/admin/CellDetailsDialog';
import ManageCellAttendeesDialog from '@/components/admin/ManageCellAttendeesDialog';
import CellCsvImporter from '@/components/admin/CellCsvImporter';

// ─── Types ───────────────────────────────────────────────────────
interface Cuerda {
  id: string; numero: string; zona_id: string;
  address?: string | null; referente_name?: string | null;
  meeting_day?: string | null; meeting_time?: string | null;
}
interface Zona { id: string; nombre: string; }
interface Cell {
  id: string; name: string; church_id: string;
  encargado_id: string | null; anfitrion_id: string | null;
  cuerda_id: string | null;
  address: string | null; meeting_day: string | null; meeting_time: string | null;
  lat: number | null; lng: number | null;
}

// ─── Component ───────────────────────────────────────────────────
const CuerdasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const { canAddUsers, canEditDeleteUsers, canSeeBaseDatosTotal } = usePermissions();
  const queryClient = useQueryClient();

  const [expandedCuerda, setExpandedCuerda] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [csvImporterOpen, setCsvImporterOpen] = useState(false);
  const [addCellOpen, setAddCellOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<Cell | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [attendeesFor, setAttendeesFor] = useState<string | null>(null);

  // User's own cuerda (for filtering)
  const userCuerdaNumero = profile?.numero_cuerda || null;
  const canSeeAll = canSeeBaseDatosTotal() || profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';
  const isAdminOrPastor = profile?.role === 'admin' || profile?.role === 'general' || profile?.role === 'pastor' || profile?.role === 'supervisor';

  // ─── Data fetching ─────────────────────────────────────────────
  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!).order('nombre');
      return data || [];
    },
    enabled: !!churchId,
  });

  const { data: cuerdas, isLoading: cuerdasLoading } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const zonaIds = zonas.map(z => z.id);
      const { data } = await supabase.from('cuerdas')
        .select('id, numero, zona_id, address, referente_name, meeting_day, meeting_time')
        .in('zona_id', zonaIds)
        .order('numero');
      return data || [];
    },
    enabled: !!zonas?.length,
  });

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ['cells', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('*').eq('church_id', churchId!).order('name');
      return (data || []) as Cell[];
    },
    enabled: !!churchId,
  });

  const { data: profilesMap } = useQuery<Record<string, string>>({
    queryKey: ['profilesMap', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name, email, church_id').eq('church_id', churchId!);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Sin nombre'; });
      return map;
    },
    enabled: !!churchId,
    staleTime: 60_000,
  });

  const { data: attendeeCounts } = useQuery<Record<string, number>>({
    queryKey: ['cellAttendeeCounts', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, cell_id').eq('church_id', churchId!);
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => { if (c.cell_id) counts[c.cell_id] = (counts[c.cell_id] || 0) + 1; });
      return counts;
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  // ─── Computed data ─────────────────────────────────────────────
  const cuerdaTree = useMemo(() => {
    if (!cuerdas || !zonas) return [];

    let filtered = cuerdas;
    // If user can't see all, filter to their cuerda only
    if (!canSeeAll && userCuerdaNumero) {
      filtered = cuerdas.filter(c => c.numero === userCuerdaNumero);
    }

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => {
        const zona = zonas.find(z => z.id === c.zona_id);
        const cuerdaCells = (cells || []).filter(cell => cell.cuerda_id === c.id);
        return c.numero.toLowerCase().includes(s) ||
          (c.referente_name || '').toLowerCase().includes(s) ||
          (zona?.nombre || '').toLowerCase().includes(s) ||
          cuerdaCells.some(cell => cell.name.toLowerCase().includes(s));
      });
    }

    return filtered.map(cuerda => {
      const zona = zonas.find(z => z.id === cuerda.zona_id);
      const cuerdaCells = (cells || []).filter(c => c.cuerda_id === cuerda.id);
      // Also include cells that don't have cuerda_id but might match by name pattern
      return { cuerda, zona, cells: cuerdaCells };
    });
  }, [cuerdas, zonas, cells, search, canSeeAll, userCuerdaNumero]);

  // Cells without a cuerda assigned
  const unassignedCells = useMemo(() => {
    if (!cells) return [];
    const assignedIds = new Set(cuerdaTree.flatMap(t => t.cells.map(c => c.id)));
    return cells.filter(c => !assignedIds.has(c.id) && !c.cuerda_id);
  }, [cells, cuerdaTree]);

  // Leaders list for CSV importer
  const leadersList = useMemo(() => {
    if (!profilesMap) return [];
    return Object.entries(profilesMap).map(([id, name]) => ({ id, name }));
  }, [profilesMap]);

  // ─── Actions ───────────────────────────────────────────────────
  const deleteCell = async (id: string) => {
    if (!window.confirm('¿Eliminar esta célula?')) return;
    const { error } = await supabase.from('cells').delete().eq('id', id);
    if (error) showError(error.message);
    else {
      showSuccess('Célula eliminada.');
      queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
    }
  };

  const isLoading = cuerdasLoading;

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Cuerdas</h1>
          <p className="text-muted-foreground text-xs mt-1">
            {canSeeAll ? 'Todas las cuerdas de la iglesia' : `Cuerda ${userCuerdaNumero || '—'}`}
          </p>
        </div>
        <div className="flex gap-2">
          {(isAdminOrPastor || canAddUsers()) && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCsvImporterOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Importar Células CSV
              </Button>
              <Button size="sm" onClick={() => setAddCellOpen(true)}>
                <PlusCircle className="mr-1.5 h-4 w-4" /> Nueva Célula
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      {canSeeAll && (
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar por cuerda, zona, célula..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Cuerda badge when locked */}
      {!canSeeAll && userCuerdaNumero && (
        <Badge className="bg-primary/15 text-primary text-sm px-3 py-1">
          Cuerda {userCuerdaNumero}
        </Badge>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : cuerdaTree.length === 0 && unassignedCells.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {search ? 'Sin resultados.' : 'No hay cuerdas configuradas para esta iglesia.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* ─── Cuerda cards ───────────────────────────────── */}
          {cuerdaTree.map(({ cuerda, zona, cells: cuerdaCells }) => (
            <Card key={cuerda.id}>
              <Collapsible open={expandedCuerda === cuerda.id} onOpenChange={(open) => setExpandedCuerda(open ? cuerda.id : null)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {expandedCuerda === cuerda.id ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-lg text-primary">#{cuerda.numero}</span>
                            {zona && <Badge variant="secondary" className="text-[10px]">{zona.nombre}</Badge>}
                            <Badge variant="outline" className="text-[10px]">{cuerdaCells.length} célula{cuerdaCells.length !== 1 ? 's' : ''}</Badge>
                          </div>
                          {cuerda.referente_name && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <UserCheck className="h-3 w-3" /> {cuerda.referente_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {(cuerda.meeting_day || cuerda.meeting_time) && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {[cuerda.meeting_day, cuerda.meeting_time].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    {/* Cuerda address */}
                    {cuerda.address && (
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1 ml-7">
                        <MapPin className="h-3 w-3" /> {cuerda.address}
                      </p>
                    )}

                    {/* Cells inside this cuerda */}
                    {cuerdaCells.length === 0 ? (
                      <p className="text-sm text-muted-foreground ml-7 py-2">No hay células en esta cuerda.</p>
                    ) : (
                      <div className="ml-4 space-y-1.5">
                        {cuerdaCells.map(cell => {
                          const leaderName = cell.encargado_id ? profilesMap?.[cell.encargado_id] : null;
                          const anfitrionName = cell.anfitrion_id ? profilesMap?.[cell.anfitrion_id] : null;
                          const count = attendeeCounts?.[cell.id] || 0;

                          return (
                            <div key={cell.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group border border-transparent hover:border-border transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button className="font-medium text-sm hover:underline text-left" onClick={() => setDetailsFor(cell.id)}>
                                    {cell.name}
                                  </button>
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Users className="h-3 w-3" /> {count}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                                  {leaderName && <span className="flex items-center gap-0.5"><UserCheck className="h-3 w-3" /> {leaderName}</span>}
                                  {anfitrionName && <span className="flex items-center gap-0.5"><Home className="h-3 w-3" /> {anfitrionName}</span>}
                                  {cell.address && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {cell.address}</span>}
                                  {(cell.meeting_day || cell.meeting_time) && (
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" /> {[cell.meeting_day, cell.meeting_time].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {canEditDeleteUsers() && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setDetailsFor(cell.id)}>Ver detalles</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setEditingCell(cell)}>Editar</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setAttendeesFor(cell.id)}>Gestionar miembros</DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600" onClick={() => deleteCell(cell.id)}>Eliminar</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}

          {/* ─── Unassigned cells ────────────────────────────── */}
          {unassignedCells.length > 0 && canSeeAll && (
            <Card>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <ChevronRight className="h-4 w-4" />
                      <div>
                        <span className="font-medium text-yellow-500">Células sin cuerda asignada</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">{unassignedCells.length}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="ml-4 space-y-1.5">
                      {unassignedCells.map(cell => {
                        const leaderName = cell.encargado_id ? profilesMap?.[cell.encargado_id] : null;
                        const count = attendeeCounts?.[cell.id] || 0;
                        return (
                          <div key={cell.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <button className="font-medium text-sm hover:underline" onClick={() => setDetailsFor(cell.id)}>{cell.name}</button>
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Users className="h-3 w-3" /> {count}</span>
                              </div>
                              <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground">
                                {leaderName && <span><UserCheck className="h-3 w-3 inline mr-0.5" />{leaderName}</span>}
                                {cell.address && <span><MapPin className="h-3 w-3 inline mr-0.5" />{cell.address}</span>}
                              </div>
                            </div>
                            {canEditDeleteUsers() && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditingCell(cell)}>Editar</DropdownMenuItem>
                                  <DropdownMenuItem className="text-red-600" onClick={() => deleteCell(cell.id)}>Eliminar</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{cuerdaTree.length} cuerda(s)</span>
        <span>{cuerdaTree.reduce((sum, t) => sum + t.cells.length, 0) + unassignedCells.length} célula(s) total</span>
        {unassignedCells.length > 0 && <span className="text-yellow-500">{unassignedCells.length} sin cuerda</span>}
      </div>

      {/* ─── Dialogs ──────────────────────────────────────────── */}
      <AddCellDialog
        open={addCellOpen || !!editingCell}
        onOpenChange={(o) => {
          if (!o) { setAddCellOpen(false); setEditingCell(null); queryClient.invalidateQueries({ queryKey: ['cells', churchId] }); }
          else if (!editingCell) setAddCellOpen(o);
        }}
        churchId={churchId!}
        initial={editingCell ? {
          id: editingCell.id, name: editingCell.name,
          encargado_id: editingCell.encargado_id,
          address: editingCell.address,
          meeting_day: editingCell.meeting_day,
          meeting_time: editingCell.meeting_time,
        } : null}
      />

      <CellDetailsDialog
        open={!!detailsFor}
        onOpenChange={(o) => { if (!o) setDetailsFor(null); }}
        churchId={churchId!}
        cellId={detailsFor}
      />

      <ManageCellAttendeesDialog
        open={!!attendeesFor}
        onOpenChange={(o) => {
          if (!o) {
            setAttendeesFor(null);
            queryClient.invalidateQueries({ queryKey: ['cellAttendeeCounts', churchId] });
          }
        }}
        churchId={churchId!}
        cellId={attendeesFor || ''}
      />

      <CellCsvImporter
        open={csvImporterOpen}
        onOpenChange={setCsvImporterOpen}
        churchId={churchId!}
        cuerdas={cuerdas || []}
        leaders={leadersList}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['cells', churchId] })}
      />
    </div>
  );
};

export default CuerdasPage;
