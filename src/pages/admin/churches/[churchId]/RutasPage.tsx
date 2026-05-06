"use client";
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Plus, Route as RouteIcon, ExternalLink, Copy, Trash2, MapPin, Clock } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const RutasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery<any[]>({
    queryKey: ['route-projects', profile?.id, churchId],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase.from('shared_routes')
        .select('id, share_token, name, created_at, expires_at, ordered_contact_ids, total_meters, total_seconds, start_address')
        .eq('created_by', profile.id)
        .eq('church_id', churchId!)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id && !!churchId,
  });

  const handleCreate = async () => {
    const name = window.prompt('Nombre del nuevo proyecto de ruta:', `Ruta ${new Date().toLocaleDateString('es-AR')}`);
    if (name === null) return; // cancelled
    const finalName = name.trim() || `Ruta ${new Date().toLocaleDateString('es-AR')}`;
    try {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from('shared_routes').insert({
        share_token: token,
        name: finalName,
        created_by: profile?.id,
        church_id: churchId,
        ordered_contact_ids: [],
        expires_at: expiresAt,
        visited: {},
        notes: '',
      }).select().single();
      if (error) throw error;
      showSuccess(`Proyecto "${finalName}" creado.`);
      queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      navigate(`/admin/churches/${churchId}/rutas/${data.id}`);
    } catch (e: any) {
      showError(e.message || 'Error al crear el proyecto.');
    }
  };

  const handleDelete = async (project: any) => {
    if (!confirm(`¿Eliminar el proyecto "${project.name}"?`)) return;
    await supabase.from('shared_routes').delete().eq('id', project.id);
    queryClient.invalidateQueries({ queryKey: ['route-projects'] });
    showSuccess('Proyecto eliminado.');
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-2">
        <RouteIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Rutas</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Cada proyecto de ruta es un mapa con contactos seleccionables, una ruta optimizada y un link compartible.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* New project card */}
        <button
          onClick={handleCreate}
          className="group flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed border-border rounded-lg p-6 hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-3 transition-colors">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <div className="text-sm font-semibold text-primary">Nuevo proyecto de ruta</div>
          <div className="text-xs text-muted-foreground mt-1 text-center">Empezá a planificar visitas</div>
        </button>

        {isLoading && projects.length === 0 && (
          <div className="text-sm text-muted-foreground col-span-full text-center py-8">Cargando proyectos...</div>
        )}

        {/* Existing project cards */}
        {projects.map((p: any) => {
          const expiresIn = Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          const stops = (p.ordered_contact_ids || []).length;
          const url = `${window.location.origin}/r/${p.share_token}`;
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/admin/churches/${churchId}/rutas/${p.id}`)}
              className="border rounded-lg p-4 bg-card hover:bg-card/80 cursor-pointer transition-colors flex flex-col min-h-[200px]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name || 'Sin nombre'}</div>
                  <div className="text-xs text-muted-foreground">
                    Creado el {new Date(p.created_at).toLocaleDateString('es-AR')}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  className="text-muted-foreground hover:text-red-400 p-1 -mr-1 -mt-1 rounded"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{stops} {stops === 1 ? 'parada' : 'paradas'}</span>
                  {p.total_meters && (
                    <>
                      <span>·</span>
                      <span>{(p.total_meters / 1000).toFixed(1)} km</span>
                    </>
                  )}
                  {p.total_seconds && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(p.total_seconds)}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Expira en {expiresIn} {expiresIn === 1 ? 'día' : 'días'}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => navigate(`/admin/churches/${churchId}/rutas/${p.id}`)}>
                  Editar
                </Button>
                {stops > 0 && (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => window.open(url, '_blank')} title="Abrir link público">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
                      navigator.clipboard.writeText(url);
                      showSuccess('Link copiado');
                    }} title="Copiar link">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RutasPage;
