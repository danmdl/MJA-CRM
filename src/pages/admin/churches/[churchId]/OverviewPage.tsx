"use client";

import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  // Load leaders for main pastor selection
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
    enabled: !!churchId && isAdminOrGeneral,
    staleTime: 60_000
  });

  // Analytics queries
  const { data: cells } = useQuery({
    queryKey: ['overview-cells', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('cells').select('id, meeting_day, meeting_time, encargado_id').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId
  });
  const { data: contacts } = useQuery({
    queryKey: ['overview-contacts', churchId],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, leader_assigned, cell_id').eq('church_id', churchId!);
      return data || [];
    },
    enabled: !!churchId
  });

  const analytics = useMemo(() => {
    const c = cells || [];
    const ppl = contacts || [];
    const cellsCount = c.length;
    const withLeader = ppl.filter((p: any) => !!p.leader_assigned).length;
    const withoutLeader = ppl.length - withLeader;
    const perDay: Record<string, number> = {};
    const perTime: Record<string, number> = {};
    c.forEach((x: any) => {
      if (x.meeting_day) perDay[x.meeting_day] = (perDay[x.meeting_day] || 0) + 1;
      if (x.meeting_time) perTime[x.meeting_time] = (perTime[x.meeting_time] || 0) + 1;
    });
    const cellsPerId: Record<string, number> = {};
    c.forEach((x: any) => { if (x.encargado_id) cellsPerId[x.encargado_id] = (cellsPerId[x.encargado_id] || 0) + 1; });
    const topReferente = Object.entries(cellsPerId).sort((a,b)=>b[1]-a[1])[0] || null;
    const membersPerCell: Record<string, number> = {};
    ppl.forEach((p: any) => { if (p.cell_id) membersPerCell[p.cell_id] = (membersPerCell[p.cell_id] || 0) + 1; });
    const topCells = Object.entries(membersPerCell).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return { cellsCount, withLeader, withoutLeader, perDay, perTime, topReferente, topCells };
  }, [cells, contacts]);

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
          {/* Removed Church ID from display */}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Pastor: admin/general can edit; others see name */}
          <div>
            <div className="font-medium">Pastor Principal</div>
            {isAdminOrGeneral ? (
              <div className="mt-1 max-w-xs">
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
              <div className="text-muted-foreground">
                {/* We can show an ID fallback if needed, but try to resolve to name */}
                {/* This minimal version shows ID or 'No asignado' */}
                {church.pastor_id ? 'Asignado' : 'No asignado'}
              </div>
            )}
          </div>
          <p><strong>Fecha de Creación:</strong> {new Date(church.created_at).toLocaleDateString()}</p>
          {/* Removed pinned order and details */}
          
          {/* Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Número de Células</div>
              <div className="text-2xl font-bold">{analytics.cellsCount}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Asistentes con referente</div>
              <div className="text-2xl font-bold">{analytics.withLeader}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-muted-foreground">Asistentes sin referente</div>
              <div className="text-2xl font-bold">{analytics.withoutLeader}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Células por Día</div>
              <div className="space-y-1 text-sm">
                {Object.keys(analytics.perDay).length === 0 ? (
                  <div className="text-muted-foreground">Sin datos</div>
                ) : (
                  Object.entries(analytics.perDay).map(([d, n]) => (
                    <div key={d} className="flex justify-between"><span>{d}</span><span className="font-medium">{n as number}</span></div>
                  ))
                )}
              </div>
            </div>
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Células por Hora</div>
              <div className="space-y-1 text-sm">
                {Object.keys(analytics.perTime).length === 0 ? (
                  <div className="text-muted-foreground">Sin datos</div>
                ) : (
                  Object.entries(analytics.perTime).map(([t, n]) => (
                    <div key={t} className="flex justify-between"><span>{t}</span><span className="font-medium">{n as number}</span></div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded border">
              <div className="font-medium mb-2">Referente con más Células</div>
              <div className="text-sm">
                {analytics.topReferente ? (
                  <span>{(analytics.topReferente[1] as number)} célula(s)</span>
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
                  analytics.topCells.map(([cellId, count]) => (
                    <div key={cellId} className="flex justify-between">
                      <span>ID {cellId}</span>
                      <span className="font-medium">{count as number}</span>
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