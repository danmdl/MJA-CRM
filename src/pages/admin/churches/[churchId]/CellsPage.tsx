"use client";

import React, { useMemo, useState } from 'react';
import { usePermissions } from '@/lib/permissions';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, MoreHorizontal, Users, MapPin, Clock, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { showError, showSuccess } from '@/utils/toast';
import AddCellDialog from '@/components/admin/AddCellDialog';
import CellDetailsDialog from '@/components/admin/CellDetailsDialog';
import ManageCellAttendeesDialog from '@/components/admin/ManageCellAttendeesDialog';

interface CellRow {
  id: string;
  name: string;
  church_id: string;
  encargado_id: string | null;
  address: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  created_at: string;
  leader_name?: string | null;
  attendee_count?: number;
}

const fetchCells = async (churchId: string): Promise<CellRow[]> => {
  const { data, error } = await supabase
    .from('cells')
    .select('*')
    .eq('church_id', churchId)
    .order('name', { ascending: true });
  if (error) throw new Error('No se pudieron cargar las células.');
  return data || [];
};

const fetchProfilesMap = async (churchId: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, church_id')
    .eq('church_id', churchId);
  if (error) return {};
  const map: Record<string, string> = {};
  (data || []).forEach(p => {
    map[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Sin nombre';
  });
  return map;
};

const fetchAttendeeCounts = async (churchId: string): Promise<Record<string, number>> => {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, cell_id')
    .eq('church_id', churchId);
  if (error) return {};
  const counts: Record<string, number> = {};
  (data || []).forEach((c: any) => {
    if (c.cell_id) counts[c.cell_id] = (counts[c.cell_id] || 0) + 1;
  });
  return counts;
};

const CellsPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { canAddUsers, canEditDeleteUsers } = usePermissions();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<CellRow | null>(null);
  const [attendeesFor, setAttendeesFor] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: cells, isLoading, isError, error } = useQuery<CellRow[]>({
    queryKey: ['cells', churchId],
    queryFn: () => fetchCells(churchId!),
    enabled: !!churchId,
  });

  const { data: profilesMap } = useQuery({
    queryKey: ['profilesMap', churchId],
    queryFn: () => fetchProfilesMap(churchId!),
    enabled: !!churchId,
    staleTime: 60_000,
  });

  const { data: attendeeCounts } = useQuery({
    queryKey: ['cellAttendeeCounts', churchId],
    queryFn: () => fetchAttendeeCounts(churchId!),
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const all = (cells || []).map(c => ({
      ...c,
      leader_name: c.encargado_id ? (profilesMap?.[c.encargado_id] || 'Sin nombre') : null,
      attendee_count: attendeeCounts?.[c.id] || 0,
    }));
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(c => {
      const s = `${c.name} ${c.leader_name || ''} ${c.address || ''}`.toLowerCase();
      return s.includes(q);
    });
  }, [cells, profilesMap, attendeeCounts, search]);

  const deleteCell = async (id: string) => {
    if (!window.confirm('¿Eliminar esta célula?')) return;
    const { error } = await supabase.from('cells').delete().eq('id', id);
    if (error) showError(error.message || 'Error al eliminar célula.');
    else {
      showSuccess('Célula eliminada.');
      queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
      queryClient.invalidateQueries({ queryKey: ['cellAttendeeCounts', churchId] });
    }
  };

  const handleCloseDialog = () => {
    setIsAddOpen(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ['cells', churchId] });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Células</h1>
        {canAddUsers() && (
        <Button onClick={() => setIsAddOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> Crear Célula
        </Button>
      )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Listado de Células</CardTitle>
            <div className="relative w-[320px] max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, referente o dirección"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <CardDescription>Gestiona referentes, asistentes y horarios de cada célula.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <div className="text-red-500">Error: {(error as any)?.message || 'No se pudieron cargar las células.'}</div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Referente</TableHead>
                    <TableHead className="min-w-[160px]">Asistentes</TableHead>
                    <TableHead className="min-w-[200px]"><div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Dirección</div></TableHead>
                    <TableHead className="min-w-[160px]"><div className="flex items-center gap-2"><Clock className="h-4 w-4" /> Día / Hora</div></TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">No hay células.</TableCell>
                    </TableRow>
                  ) : rows.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <button
                          className="hover:underline text-left"
                          onClick={() => setDetailsFor(c.id)}
                          title="Ver detalles de la célula"
                        >
                          {c.name}
                        </button>
                      </TableCell>
                      <TableCell>{c.leader_name || 'Sin referente'}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Users className="h-4 w-4" /> {c.attendee_count}</div></TableCell>
                      <TableCell>{c.address || '-'}</TableCell>
                      <TableCell>{[c.meeting_day, c.meeting_time].filter(Boolean).join(' · ') || '-'}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menú</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(c)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAttendeesFor(c.id)}>Gestionar Asistentes</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => deleteCell(c.id)}>Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddCellDialog
        open={isAddOpen || !!editing}
        onOpenChange={(o) => {
          if (!o) handleCloseDialog();
          else if (!editing) setIsAddOpen(o);
        }}
        churchId={churchId!}
        initial={editing ? {
          id: editing.id,
          name: editing.name,
          encargado_id: editing.encargado_id,
          address: editing.address,
          meeting_day: editing.meeting_day,
          meeting_time: editing.meeting_time
        } : null}
      />

      <ManageCellAttendeesDialog
        open={!!attendeesFor}
        onOpenChange={(o) => {
          if (!o) {
            setAttendeesFor(null);
            // update counts
            setTimeout(() => {
              useQueryClient().invalidateQueries({ queryKey: ['cellAttendeeCounts', churchId] });
            });
          }
        }}
        churchId={churchId!}
        cellId={attendeesFor || ''}
      />

      <CellDetailsDialog
        open={!!detailsFor}
        onOpenChange={(o) => {
          if (!o) setDetailsFor(null);
        }}
        churchId={churchId!}
        cellId={detailsFor}
      />
    </div>
  );
};

export default CellsPage;