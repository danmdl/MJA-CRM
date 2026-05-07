"use client";
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Route as RouteIcon, ExternalLink, Copy, Trash2, MapPin, Clock } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

type CreateMode = 'map';

const RutasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: projects = [], isLoading } = useQuery<any[]>({
    queryKey: ['route-projects', churchId, profile?.id, profile?.role, profile?.numero_cuerda],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Routes are visible at the cuerda level — a referente in cuerda
      // 202 sees every route created by anyone in cuerda 202 (including
      // their own), but NOT routes from cuerda 105 or any other.
      // Globals (admin/general/pastor/supervisor) see every route in the
      // church regardless of cuerda. Users without a cuerda assigned fall
      // back to "only my own routes" so they at least see their work.
      const isGlobal = profile.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
      let q = supabase.from('shared_routes')
        .select('id, share_token, name, created_at, expires_at, ordered_contact_ids, total_meters, total_seconds, start_address, created_by, numero_cuerda')
        .eq('church_id', churchId!)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (!isGlobal) {
        if (profile.numero_cuerda) {
          q = q.eq('numero_cuerda', profile.numero_cuerda);
        } else {
          q = q.eq('created_by', profile.id);
        }
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!profile?.id && !!churchId,
  });

  const openCreateDialog = () => {
    // Mode picker was removed — every project is created in 'map' mode
    // now (Dan asked to drop the contacts-list flow). Pre-fill the name
    // with today's date so the user can usually just hit Enter.
    setProjectName(`Ruta ${new Date().toLocaleDateString('es-AR')}`);
    setCreateOpen(true);
  };

  const confirmCreate = async () => {
    const finalName = projectName.trim() || `Ruta ${new Date().toLocaleDateString('es-AR')}`;
    setCreating(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      // 60 days. Past that, links auto-expire and projects drop out of
      // the grid — keeps shared_routes from accumulating garbage.
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from('shared_routes').insert({
        share_token: token,
        name: finalName,
        created_by: profile?.id,
        church_id: churchId,
        // Stamp the route with the creator's cuerda so visibility lookups
        // (the list query above) can filter by cuerda without joining
        // profiles. If the user has no cuerda assigned, the field stays
        // null — the list query treats null as "only the creator sees it"
        // for non-globals, which keeps the route accessible to its
        // creator without leaking it cross-cuerda.
        numero_cuerda: profile?.numero_cuerda || null,
        ordered_contact_ids: [],
        expires_at: expiresAt,
        visited: {},
        notes: '',
      }).select().single();
      if (error) throw error;
      showSuccess(`Proyecto "${finalName}" creado.`);
      queryClient.invalidateQueries({ queryKey: ['route-projects'] });
      setCreateOpen(false);
      // Always go to the map editor — that's the only flow now.
      navigate(`/admin/churches/${churchId}/rutas/${data.id}/mapa`);
    } catch (e: any) {
      showError(e.message || 'Error al crear el proyecto.');
    } finally {
      setCreating(false);
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
          onClick={openCreateDialog}
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

      {/* Name-only create dialog. The mode picker is gone — every new
          project goes to the map editor directly. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo proyecto de ruta</DialogTitle>
            <DialogDescription>
              Vas a poder filtrar contactos y elegirlos en el mapa.
            </DialogDescription>
          </DialogHeader>

          <div className="pt-1">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nombre del proyecto
            </label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Ruta de hoy"
              className="mt-1.5"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) confirmCreate();
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button onClick={confirmCreate} disabled={creating}>
                {creating ? 'Creando...' : 'Crear y continuar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RutasPage;
