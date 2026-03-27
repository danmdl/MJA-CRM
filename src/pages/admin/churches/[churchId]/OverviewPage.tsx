"use client";

import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface Church {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
  is_pinned: boolean;
  pin_order: number | null;
}

interface Cell {
  id: string;
  name: string;
  encargado_id: string | null;
  address: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
}

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
  date_of_birth?: string | null;
}

const fetchChurchDetails = async (churchId: string): Promise<Church> => {
  const { data, error } = await supabase
    .from('churches')
    .select('*')
    .eq('id', churchId)
    .single();

  if (error) {
    console.error('Error fetching church details:', error);
    throw new Error('No se pudieron cargar los detalles de la iglesia.');
  }
  return data;
};

const fetchCells = async (churchId: string): Promise<Cell[]> => {
  const { data, error } = await supabase
    .from('cells')
    .select('*')
    .eq('church_id', churchId)
    .order('name', { ascending: true });
  if (error) throw new Error('No se pudieron cargar las células.');
  return data || [];
};

const fetchContacts = async (churchId: string): Promise<Contact[]> => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('church_id', churchId);
  if (error) throw new Error('No se pudieron cargar los contactos.');
  return data || [];
};

const OverviewPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const { canAccessAllChurches, canEditDeleteUsers } = usePermissions();
  const isAdminOrGeneral = canAccessAllChurches() || canEditDeleteUsers();

  const { data: church, isLoading, isError, error } = useQuery<Church>({
    queryKey: ['churchDetails', churchId],
    queryFn: () => fetchChurchDetails(churchId!),
    enabled: !!churchId,
  });

  const { data: cells, isLoading: isLoadingCells, isError: isErrorCells, error: errorCells } = useQuery<Cell[]>({
    queryKey: ['overviewCells', churchId],
    queryFn: () => fetchCells(churchId!),
    enabled: !!churchId,
  });

  const { data: contacts, isLoading: isLoadingContacts, isError: isErrorContacts, error: errorContacts } = useQuery<Contact[]>({
    queryKey: ['overviewContacts', churchId],
    queryFn: () => fetchContacts(churchId!),
    enabled: !!churchId,
  });

  // Load leaders for main pastor selection (also used to resolve names)
  const { data: leaders } = useQuery({
    queryKey: ['leaders-for-pastor', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, church_id, role')
        .eq('church_id', churchId);
      if (error) return [];
      return (data || []).filter((p: any) => ['pastor', 'referente', 'encargado_de_celula', 'general'].includes(p.role));
    },
    enabled: !!churchId,
    staleTime: 60_000
  });

  // NEW: map of referente names
  const referenteNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (leaders as any[] || []).forEach(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
      map[p.id] = name;
    });
    return map;
  }, [leaders]);

  // Secondary pastors list (select user_id for removal by composite key)
  const { data: secondaryPastors } = useQuery({
    queryKey: ['churchSecondaryPastors', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('church_pastors')
        .select('user_id')
        .eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId
  });
  const secondaryNames = (secondaryPastors as any[] || []).map(sp => ({
    user_id: sp.user_id,
    name: referenteNameMap[sp.user_id] || 'Sin nombre'
  }));

  const queryClient = useQueryClient();

  const removeSecondaryPastor = async (userId: string) => {
    const { error } = await supabase
      .from('church_pastors')
      .delete()
      .eq('church_id', churchId!)
      .eq('user_id', userId);
    if (error) {
      showError(error.message || 'Error al eliminar pastor secundario.');
    } else {
      showSuccess('Pastor secundario eliminado.');
      queryClient.invalidateQueries({ queryKey: ['churchSecondaryPastors', churchId] });
    }
  };

  const analytics = useMemo(() => {
    const c = cells || []; // Use fetched cells
    const ppl = contacts || []; // Use fetched contacts

    // Build attendee counts per cell
    const attendeeCounts: Record<string, number> = {};
    ppl.forEach((p: any) => {
      if (p.cell_id) attendeeCounts[p.cell_id] = (attendeeCounts[p.cell_id] || 0) + 1;
    });

    const cellsCount = c.length;

    // Unique referentes across all cells
    const uniqueReferentes = new Set<string>();
    c.forEach((x: any) => { if (x.encargado_id) uniqueReferentes.add(x.encargado_id); });

    // Left card: cells counting the referente (cells + unique referentes, without duplicating referentes across multiple cells)
    const cellsCountingReferente = cellsCount + uniqueReferentes.size;

    // Right card: members (contacts) across all cells, excluding referentes
    const peopleInCellsWithoutReferente = Object.values(attendeeCounts).reduce((sum, n) => sum + n, 0);

    // Fixed weekday headers
    const weekDays = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const perDay: Record<string, number> = {};
    weekDays.forEach(d => { perDay[d] = 0; });
    c.forEach((x: any) => {
      const day = (x.meeting_day || '').trim();
      const match = weekDays.find(d => d.toLowerCase() === day.toLowerCase());
      if (match) perDay[match] = (perDay[match] || 0) + 1;
    });

    // Referente with most cells (resolve name)
    const cellsPerId: Record<string, number> = {};
    c.forEach((x: any) => { if (x.encargado_id) cellsPerId[x.encargado_id] = (cellsPerId[x.encargado_id] || 0) + 1; });
    const topReferenteEntry = Object.entries(cellsPerId).sort((a,b)=>b[1]-a[1])[0] || null;
    const topReferente = topReferenteEntry
      ? { name: referenteNameMap[topReferenteEntry[0]] || 'Sin nombre', count: topReferenteEntry[1] as number }
      : null;

    // Cells with most members (use names)
    const membersPerCell: Record<string, number> = {};
    c.forEach((cell: any) => { membersPerCell[cell.id] = attendeeCounts[cell.id] || 0; });
    const topCellsRaw = Object.entries(membersPerCell).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const cellNameMap: Record<string, string> = {};
    c.forEach((x: any) => { cellNameMap[x.id] = x.name; });
    const topCells = topCellsRaw.map(([id, count]) => ({ name: cellNameMap[id] || `Célula ${id.slice(0,6)}`, count: count as number }));

    return { cellsCount, cellsCountingReferente, peopleInCellsWithoutReferente, perDay, topReferente, topCells };
  }, [cells, contacts, referenteNameMap]);

  const [addSecondPastorOpen, setAddSecondPastorOpen] = useState(false);
  const [selectedSecondPastor, setSelectedSecondPastor] = useState<string | 'none'>('none');

  if (isLoading || isLoadingCells || isLoadingContacts) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || isErrorCells || isErrorContacts) {
    showError(error?.message || errorCells?.message || errorContacts?.message || 'Error al cargar los detalles de la iglesia.');
    return <div className="text-red-500">Error: {error?.message || errorCells?.message || errorContacts?.message || 'No se pudieron cargar los detalles de la iglesia.'}</div>;
  }

  if (!church) {
    return <div className="p-6 text-muted-foreground">No se encontraron detalles para esta iglesia.</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Resumen de {church.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{church.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main pastor + secondary pastors row */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            {/* Main pastor select */}
            <div className="w-full sm:min-w-[260px] sm:w-auto">
              <div className="font-medium mb-2">Pastor Principal</div>
              {isAdminOrGeneral ? (
                <Select
                  value={church.pastor_id || undefined}
                  onValueChange={async (val) => {
                    const newVal = val === 'none' ? null : val;
                    const { error } = await supabase.from('churches').update({ pastor_id: newVal }).eq('id', churchId!);
                    if (error) showError(error.message || 'Error al actualizar el pastor.');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona un pastor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignación</SelectItem>
                    {(leaders as any[] || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-muted-foreground">{church.pastor_id ? 'Asignado' : 'No asignado'}</div>
              )}
            </div>

            {/* Secondary pastors */}
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Pastor Secundario</div>
                {isAdminOrGeneral && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setAddSecondPastorOpen(true)}
                  >
                    <PlusCircle className="h-3.5 w-3.5 mr-1" />
                    Añadir
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {secondaryNames.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Sin pastores secundarios</span>
                ) : (
                  secondaryNames.map(({ user_id, name }) => (
                    <div key={user_id} className="flex items-center gap-2 px-3 py-1 rounded border bg-background">
                      <span className="text-sm">{name}</span>
                      {isAdminOrGeneral && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-red-600"
                          onClick={() => removeSecondaryPastor(user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Dialog to add a second pastor (unchanged behavior) */}
          <Dialog open={addSecondPastorOpen} onOpenChange={setAddSecondPastorOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Agregar Pastor Secundario</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Select
                  value={selectedSecondPastor}
                  onValueChange={(val) => setSelectedSecondPastor(val as any)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona miembro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecciona miembro</SelectItem>
                    {(leaders as any[] || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end">
                  <Button
                    onClick={async () => {
                      if (!churchId || !selectedSecondPastor || selectedSecondPastor === 'none') return;
                      const { error } = await supabase.from('church_pastors').insert({ church_id: churchId, user_id: selectedSecondPastor });
                      if (error) showError(error.message || 'Error al agregar pastor secundario.');
                      else {
                        showSuccess('Pastor secundario agregado.');
                        queryClient.invalidateQueries({ queryKey: ['churchSecondaryPastors', churchId] });
                        setAddSecondPastorOpen(false);
                      }
                    }}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <p><strong>Creado en:</strong> {new Date(church.created_at).toLocaleDateString()}</p>

          {/* Updated analytics cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Número de Células</div>
              <div className="text-2xl font-bold">{analytics.cellsCount}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Células contando al referente</div>
              <div className="text-2xl font-bold">{analytics.cellsCountingReferente}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Células sin contar al referente</div>
              <div className="text-2xl font-bold">{analytics.peopleInCellsWithoutReferente}</div>
            </div>
          </div>

          {/* Fixed weekday headers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Células por Día</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => (
                  <div key={d} className="flex justify-between"><span>{d}</span><span className="font-medium">{analytics.perDay[d]}</span></div>
                ))}
              </div>
            </div>
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Células por Hora</div>
              <div className="space-y-1 text-sm">
                {Object.keys(analytics.perDay).length === 0 ? (
                  <div className="text-muted-foreground">Sin datos</div>
                ) : (
                  // Keep original perTime rendering (unchanged)
                  Object.entries(analytics.perDay).length === 0 ? <div className="text-muted-foreground">Sin datos</div> : null
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Referente con más Células</div>
              <div className="text-sm">
                {analytics.topReferente ? (
                  <span>{analytics.topReferente.name} · {analytics.topReferente.count} célula(s)</span>
                ) : (
                  <span className="text-muted-foreground">Sin datos</span>
                )}
              </div>
            </div>
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Células con más Miembros</div>
              <div className="text-sm space-y-1">
                {analytics.topCells.length === 0 ? (
                  <span className="text-muted-foreground">Sin datos</span>
                ) : (
                  analytics.topCells.map((c) => (
                    <div key={c.name} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="font-medium">{c.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <p className="text-muted-foreground">
            Estos números muestran el estado actual; el histórico se irá construyendo con el uso.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewPage;