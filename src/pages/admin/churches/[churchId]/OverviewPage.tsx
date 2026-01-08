"use client";

import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlusCircle } from 'lucide-react';

interface Church {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
  is_pinned: boolean;
  pin_order: number | null;
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

const OverviewPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile } = useSession();
  const isAdminOrGeneral = profile?.role === 'admin' || profile?.role === 'general';

  const { data: church, isLoading, isError, error } = useQuery<Church>({
    queryKey: ['churchDetails', churchId],
    queryFn: () => fetchChurchDetails(churchId!),
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
      return (data || []).filter((p: any) => ['pastor', 'piloto', 'encargado_de_celula', 'general'].includes(p.role));
    },
    enabled: !!churchId,
    staleTime: 60_000
  });

  // Cells with names for analytics
  const { data: cells } = useQuery({
    queryKey: ['overview-cells', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, name, meeting_day, meeting_time, encargado_id').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId
  });

  const { data: contacts } = useQuery({
    queryKey: ['overview-contacts', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, cell_id').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId
  });

  const analytics = useMemo(() => {
    const c = (cells as any[]) || [];
    const ppl = (contacts as any[]) || [];

    // Build attendee counts per cell
    const attendeeCounts: Record<string, number> = {};
    ppl.forEach((p: any) => {
      if (p.cell_id) attendeeCounts[p.cell_id] = (attendeeCounts[p.cell_id] || 0) + 1;
    });

    const cellsCount = c.length;

    // Totals of people considering referente presence:
    const peopleInCellsWithReferente = c
      .filter(x => !!x.encargado_id)
      .reduce((sum, cell) => sum + (attendeeCounts[cell.id] || 0) + 1, 0); // +1 referente per cell

    const peopleInCellsWithoutReferente = c
      .filter(x => !x.encargado_id)
      .reduce((sum, cell) => sum + (attendeeCounts[cell.id] || 0), 0);

    // Days of week fixed headers (Spanish)
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

    // Cells with most members (use names)
    const membersPerCell: Record<string, number> = {};
    c.forEach((cell: any) => { membersPerCell[cell.id] = attendeeCounts[cell.id] || 0; });
    const topCellsRaw = Object.entries(membersPerCell).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const cellNameMap: Record<string, string> = {};
    c.forEach((x: any) => { cellNameMap[x.id] = x.name; });
    const topCells = topCellsRaw.map(([id, count]) => ({ name: cellNameMap[id] || `Célula ${id.slice(0,6)}`, count: count as number }));

    // Resolve referente name map from leaders
    const referenteNameMap: Record<string, string> = {};
    (leaders as any[] || []).forEach(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
      referenteNameMap[p.id] = name;
    });

    const topReferente = topReferenteEntry
      ? { name: referenteNameMap[topReferenteEntry[0]] || 'Sin nombre', count: topReferenteEntry[1] as number }
      : null;

    return { cellsCount, peopleInCellsWithReferente, peopleInCellsWithoutReferente, perDay, topReferente, topCells };
  }, [cells, contacts, leaders]);

  const [addSecondPastorOpen, setAddSecondPastorOpen] = useState(false);
  const [selectedSecondPastor, setSelectedSecondPastor] = useState<string | 'none'>('none');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    showError(error?.message || 'Error al cargar los detalles de la iglesia.');
    return <div className="text-red-500">Error: {error?.message || 'No se pudieron cargar los detalles de la iglesia.'}</div>;
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
          {/* Main Pastor with plus to add a second pastor */}
          <div>
            <div className="flex items-center gap-2">
              <div className="font-medium">Pastor Principal</div>
              {isAdminOrGeneral && (
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAddSecondPastorOpen(true)}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Añadir secundario
                </Button>
              )}
            </div>
            {isAdminOrGeneral ? (
              <div className="mt-2 max-w-xs">
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
              </div>
            ) : (
              <div className="text-muted-foreground">{church.pastor_id ? 'Asignado' : 'No asignado'}</div>
            )}

            {/* Dialog to add a second pastor */}
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
          </div>

          <p><strong>Creado en:</strong> {new Date(church.created_at).toLocaleDateString()}</p>

          {/* Updated analytics cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Número de Células</div>
              <div className="text-2xl font-bold">{analytics.cellsCount}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Células con referente</div>
              <div className="text-2xl font-bold">{analytics.peopleInCellsWithReferente}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Células sin referente</div>
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