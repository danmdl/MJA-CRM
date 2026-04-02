"use client";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { useSession } from '@/hooks/use-session';

interface Barrio { id: string; nombre: string; zona_id: string; }
interface Cuerda { id: string; numero: string; zona_id: string; }
interface Zona {
  id: string; nombre: string; church_id: string;
  barrios: Barrio[];
  cuerdas: Cuerda[];
}

const ZonasPage = () => {
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [expandedZona, setExpandedZona] = useState<string | null>(null);
  const [newBarrioName, setNewBarrioName] = useState<Record<string, string>>({});
  const [newZonaName, setNewZonaName] = useState('');
  const [addingZona, setAddingZona] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'general';

  const { data: zonas, isLoading } = useQuery<Zona[]>({
    queryKey: ['zonas-admin', profile?.church_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zonas')
        .select('id, nombre, church_id, barrios(id, nombre, zona_id), cuerdas(id, numero, zona_id)')
        .eq('church_id', profile!.church_id!)
        .order('nombre');
      if (error) throw error;
      return (data || []) as Zona[];
    },
    enabled: !!profile?.church_id,
  });

  // Add barrio
  const addBarrioMutation = useMutation({
    mutationFn: async ({ zonaId, nombre }: { zonaId: string; nombre: string }) => {
      const { error } = await supabase.from('barrios').insert({ zona_id: zonaId, nombre: nombre.trim() });
      if (error) throw error;
    },
    onSuccess: (_, { zonaId }) => {
      showSuccess('Barrio agregado.');
      setNewBarrioName(prev => ({ ...prev, [zonaId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['zonas-admin'] });
    },
    onError: (e: any) => showError(e.message),
  });

  // Delete barrio
  const deleteBarrioMutation = useMutation({
    mutationFn: async (barrioId: string) => {
      const { error } = await supabase.from('barrios').delete().eq('id', barrioId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Barrio eliminado.');
      queryClient.invalidateQueries({ queryKey: ['zonas-admin'] });
    },
    onError: (e: any) => showError(e.message),
  });

  // Add zona
  const addZonaMutation = useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('zonas').insert({ church_id: profile!.church_id!, nombre: nombre.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Zona creada.');
      setNewZonaName('');
      setAddingZona(false);
      queryClient.invalidateQueries({ queryKey: ['zonas-admin'] });
    },
    onError: (e: any) => showError(e.message),
  });

  // Delete zona
  const deleteZonaMutation = useMutation({
    mutationFn: async (zonaId: string) => {
      const { error } = await supabase.from('zonas').delete().eq('id', zonaId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Zona eliminada.');
      queryClient.invalidateQueries({ queryKey: ['zonas-admin'] });
    },
    onError: (e: any) => showError(e.message),
  });

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Sin acceso.</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Gestión de Zonas y Barrios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cada zona tiene sus cuerdas asignadas y sus barrios. Los barrios se usan para auto-asignar contactos al pool.
          </p>
        </div>
        <Button onClick={() => setAddingZona(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Nueva Zona
        </Button>
      </div>

      {addingZona && (
        <Card>
          <CardContent className="pt-4 flex gap-2">
            <Input
              placeholder="Nombre de la nueva zona..."
              value={newZonaName}
              onChange={e => setNewZonaName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newZonaName.trim() && addZonaMutation.mutate(newZonaName)}
              autoFocus
            />
            <Button onClick={() => addZonaMutation.mutate(newZonaName)} disabled={!newZonaName.trim() || addZonaMutation.isPending}>
              Crear
            </Button>
            <Button variant="ghost" onClick={() => { setAddingZona(false); setNewZonaName(''); }}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Cargando zonas...</p>
      ) : (
        <div className="space-y-3">
          {zonas?.map(zona => (
            <Card key={zona.id}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left flex-1"
                    onClick={() => setExpandedZona(expandedZona === zona.id ? null : zona.id)}
                  >
                    {expandedZona === zona.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-base">{zona.nombre}</CardTitle>
                    <Badge variant="secondary" className="ml-2">{zona.barrios?.length || 0} barrios</Badge>
                  </button>
                  <div className="flex items-center gap-2">
                    {/* Cuerdas badges */}
                    <div className="flex gap-1 flex-wrap">
                      {zona.cuerdas?.map(c => (
                        <Badge key={c.id} variant="outline" className="text-xs">N°{c.numero}</Badge>
                      ))}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                      onClick={() => { if (confirm(`¿Eliminar zona "${zona.nombre}"? Esto eliminará también sus barrios.`)) deleteZonaMutation.mutate(zona.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedZona === zona.id && (
                <CardContent className="pt-0 pb-4 px-4">
                  <div className="pl-6 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Barrios</p>
                    {zona.barrios?.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay barrios definidos aún.</p>
                    )}
                    {zona.barrios?.map(barrio => (
                      <div key={barrio.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted group">
                        <span className="text-sm">{barrio.nombre}</span>
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-500"
                          onClick={() => deleteBarrioMutation.mutate(barrio.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    {/* Add barrio */}
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Nombre del barrio..."
                        value={newBarrioName[zona.id] || ''}
                        onChange={e => setNewBarrioName(prev => ({ ...prev, [zona.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newBarrioName[zona.id]?.trim()) {
                            addBarrioMutation.mutate({ zonaId: zona.id, nombre: newBarrioName[zona.id] });
                          }
                        }}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm" className="h-8"
                        disabled={!newBarrioName[zona.id]?.trim() || addBarrioMutation.isPending}
                        onClick={() => addBarrioMutation.mutate({ zonaId: zona.id, nombre: newBarrioName[zona.id] })}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ZonasPage;
