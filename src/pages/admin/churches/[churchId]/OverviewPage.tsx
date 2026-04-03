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
import PipelineSummaryCard from '@/components/admin/PipelineSummaryCard';
import CustomReportBuilder from '@/components/admin/CustomReportBuilder';

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
    .eq('church_id', churchId)
    .is('deleted_at', null);
  if (error) throw new Error('No se pudieron cargar los contactos.');
  return data || [];
};

// Compact list: shows first 5 items, then "Ver más" opens a dialog with full list
const CompactList = ({ title, items, columns = 1 }: { title: string; items: { label: string; value: number; sub?: string }[]; columns?: number }) => {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 5;
  const visible = items.slice(0, LIMIT);
  const hasMore = items.length > LIMIT;

  const renderItem = (item: { label: string; value: number; sub?: string }) => (
    <div key={item.label} className="flex justify-between items-baseline text-sm py-0.5">
      <span className="truncate mr-2">{item.label}</span>
      <span className="tabular-nums shrink-0">
        <span className="font-bold">{item.value}</span>
        {item.sub && <span className="text-[10px] text-muted-foreground ml-1">({item.sub})</span>}
      </span>
    </div>
  );

  return (
    <div className="p-4 rounded border">
      <div className="font-medium mb-2">{title}</div>
      {items.length === 0 ? (
        <span className="text-sm text-muted-foreground">Sin datos</span>
      ) : (
        <>
          <div style={columns > 1 ? { display: 'grid', gridTemplateColumns: `repeat(${Math.min(columns, 5)}, 1fr)`, columnGap: '1rem' } : undefined} className={columns <= 1 ? 'space-y-0' : ''}>
            {visible.map(renderItem)}
          </div>
          {hasMore && (
            <button className="text-xs text-primary hover:underline mt-2" onClick={() => setExpanded(true)}>
              Ver más ({items.length - LIMIT} más)
            </button>
          )}
        </>
      )}
      {/* Full list dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-1">
            {items.map(renderItem)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
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

  // Fetch cuerdas + zonas for analytics breakdowns
  const { data: cuerdas } = useQuery({
    queryKey: ['overviewCuerdas', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id');
      return data || [];
    },
    enabled: !!churchId,
  });
  const { data: zonas } = useQuery({
    queryKey: ['overviewZonas', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId!);
      return data || [];
    },
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

    // Build cuerda and zona maps
    const cuerdaMap = new Map((cuerdas || []).map((cr: any) => [cr.id, cr]));
    const zonaMap = new Map((zonas || []).map((z: any) => [z.id, z]));

    // Cells per zona (localidad)
    const perZona: Record<string, number> = {};
    c.forEach((cell: any) => {
      const cuerda = cuerdaMap.get(cell.cuerda_id);
      const zona = cuerda ? zonaMap.get(cuerda.zona_id) : null;
      const zonaName = zona?.nombre || 'Sin zona';
      perZona[zonaName] = (perZona[zonaName] || 0) + 1;
    });

    // Cells per cuerda
    const perCuerda: Record<string, number> = {};
    c.forEach((cell: any) => {
      const cuerda = cuerdaMap.get(cell.cuerda_id);
      const num = cuerda?.numero || 'Sin cuerda';
      perCuerda[num] = (perCuerda[num] || 0) + 1;
    });

    // Personas per cuerda (con y sin piloto)
    const personasPorCuerda: Record<string, { conPiloto: number; sinPiloto: number }> = {};
    c.forEach((cell: any) => {
      const cuerda = cuerdaMap.get(cell.cuerda_id);
      const num = cuerda?.numero || 'Sin cuerda';
      if (!personasPorCuerda[num]) personasPorCuerda[num] = { conPiloto: 0, sinPiloto: 0 };
      const members = attendeeCounts[cell.id] || 0;
      const hasPiloto = !!cell.encargado_id;
      personasPorCuerda[num].conPiloto += members + (hasPiloto ? 1 : 0);
      personasPorCuerda[num].sinPiloto += members;
    });

    return { cellsCount, cellsCountingReferente, peopleInCellsWithoutReferente, perDay, topReferente, topCells, perZona, perCuerda, personasPorCuerda };
  }, [cells, contacts, referenteNameMap, cuerdas, zonas]);

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

  // Resolve pastor name for display
  const pastorName = church.pastor_id
    ? ((leaders as any[] || []).find((p: any) => p.id === church.pastor_id)
      ? `${((leaders as any[]).find((p: any) => p.id === church.pastor_id)).first_name || ''} ${((leaders as any[]).find((p: any) => p.id === church.pastor_id)).last_name || ''}`.trim()
      : null)
    : null;

  return (
    <div className="space-y-5">
      {/* Header: church name + pastor name + report button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{church.name}</h1>
          {pastorName && <p className="text-sm text-muted-foreground">Pastor: {pastorName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <CustomReportBuilder churchId={churchId!} churchName={church.name} inline />
          {isAdminOrGeneral && (
            <>
              <div className="flex items-center gap-1.5">
                <Select
                  value={church.pastor_id || undefined}
                  onValueChange={async (val) => {
                    const newVal = val === 'none' ? null : val;
                    const { error } = await supabase.from('churches').update({ pastor_id: newVal }).eq('id', churchId!);
                    if (error) showError(error.message);
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Asignar pastor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignación</SelectItem>
                    {(leaders as any[] || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setAddSecondPastorOpen(true)}>
                <PlusCircle className="h-3.5 w-3.5" /> 2°
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Secondary pastors badges (only show if any exist) */}
      {secondaryNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Pastores secundarios:</span>
          {secondaryNames.map(({ user_id, name }) => (
            <div key={user_id} className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-background">
              <span>{name}</span>
              {isAdminOrGeneral && (
                <button className="text-red-500 hover:text-red-400 ml-1" onClick={() => removeSecondaryPastor(user_id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog to add a second pastor */}
      <Dialog open={addSecondPastorOpen} onOpenChange={setAddSecondPastorOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Agregar Pastor Secundario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedSecondPastor} onValueChange={(val) => setSelectedSecondPastor(val as any)}>
              <SelectTrigger><SelectValue placeholder="Selecciona miembro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecciona miembro</SelectItem>
                {(leaders as any[] || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>{`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button onClick={async () => {
                if (!churchId || !selectedSecondPastor || selectedSecondPastor === 'none') return;
                const { error } = await supabase.from('church_pastors').insert({ church_id: churchId, user_id: selectedSecondPastor });
                if (error) showError(error.message);
                else { showSuccess('Pastor secundario agregado.'); queryClient.invalidateQueries({ queryKey: ['churchSecondaryPastors', churchId] }); setAddSecondPastorOpen(false); }
              }}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded border">
          <div className="text-sm text-muted-foreground">Cantidad de Células</div>
          <div className="text-3xl font-bold">{analytics.cellsCount}</div>
        </div>
        <div className="p-4 rounded border">
          <div className="text-sm text-muted-foreground">Personas en células</div>
          <div className="text-3xl font-bold">{analytics.cellsCountingReferente}</div>
        </div>
        <div className="p-4 rounded border">
          <div className="text-sm text-muted-foreground">Personas sin contar al Piloto</div>
          <div className="text-3xl font-bold">{analytics.peopleInCellsWithoutReferente}</div>
        </div>
      </div>

      {/* Células por Día — full day names */}
      <div className="p-4 rounded border">
        <div className="font-medium mb-3">Células por Día</div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 text-sm">
          {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => (
            <div key={d} className="text-center">
              <div className="text-muted-foreground text-xs">{d}</div>
              <div className="text-lg font-bold tabular-nums">{analytics.perDay[d]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4 analytics cards in one row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CompactList
          title="Células por Localidad"
          items={Object.entries(analytics.perZona || {}).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => ({ label: k, value: v as number }))}
        />
        <CompactList
          title="Células por Cuerda"
          items={Object.entries(analytics.perCuerda || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, v]) => ({ label: `Cda ${k}`, value: v as number }))}
        />
        <CompactList
          title="Personas por Cuerda"
          items={Object.entries(analytics.personasPorCuerda || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, d]: [string, any]) => ({ label: `Cda ${k}`, value: d.conPiloto, sub: `s/p: ${d.sinPiloto}` }))}
        />
        <CompactList
          title="Células con más Miembros"
          items={analytics.topCells.map(c => ({ label: c.name, value: c.count }))}
        />
      </div>

      {/* Pipeline at the end */}
      <PipelineSummaryCard churchId={churchId!} />
    </div>
  );
};

export default OverviewPage;