"use client";
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Plus, Route as RouteIcon, ExternalLink, Copy, Trash2, MapPin, Check, MessageSquare, ChevronDown } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const RutasPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const navigate = useNavigate();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [filterCuerdas, setFilterCuerdas] = useState<Set<string>>(new Set());

  // Only supervisor and above can see the cuerda filter (they see
  // routes across multiple cuerdas; lower roles only see their own).
  const canFilterByCuerda = profile?.role &&
    ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
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
        .select('id, share_token, name, created_at, expires_at, ordered_contact_ids, total_meters, total_seconds, start_address, created_by, numero_cuerda, visited, notes_updated_at, notes_seen_at')
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
      const routes = data || [];
      // Batch-resolve creator names for cards that belong to others
      const creatorIds = [...new Set(routes.map((r: any) => r.created_by).filter(Boolean))];
      const { data: creatorProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', creatorIds);
      const nameMap = new Map((creatorProfiles || []).map((p: any) => [
        p.id,
        `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre',
      ]));
      return routes.map((r: any) => ({ ...r, creator_name: nameMap.get(r.created_by) || '' }));
    },
    enabled: !!profile?.id && !!churchId,
    // Live-ish refresh so the 'NUEVA NOTA' pill appears without the
    // creator having to reload the page. 20 seconds is a reasonable
    // balance — fast enough to feel real-time when someone leaves a
    // comment in the public viewer, slow enough to not hammer the DB
    // for users who leave the Rutas tab open in a background pin.
    // refetchOnWindowFocus also kicks in when the user comes back to
    // the tab, which catches the case where they were away longer
    // than the interval.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
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

  const cuerdaOptions = React.useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p: any) => { if (p.numero_cuerda) set.add(String(p.numero_cuerda)); });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [projects]);

  const visibleProjects = React.useMemo(() => {
    if (!canFilterByCuerda || filterCuerdas.size === 0) return projects;
    return projects.filter((p: any) => p.numero_cuerda && filterCuerdas.has(String(p.numero_cuerda)));
  }, [projects, filterCuerdas, canFilterByCuerda]);

  const handleDelete = async (project: any) => {
    if (!confirm(`¿Eliminar el proyecto "${project.name}"?`)) return;
    const { error } = await supabase.from('shared_routes').delete().eq('id', project.id);
    if (error) { showError('No se pudo eliminar el proyecto.'); return; }
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
      <p className="text-muted-foreground text-sm mb-4">
        Cada proyecto de ruta es un mapa con contactos seleccionables, una ruta optimizada y un link compartible.
      </p>

      {canFilterByCuerda && (
        <div className="flex items-center gap-2 mb-5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm font-normal">
                {filterCuerdas.size === 0
                  ? 'Todas las cuerdas'
                  : filterCuerdas.size === 1
                    ? `Cuerda ${Array.from(filterCuerdas)[0]}`
                    : `${filterCuerdas.size} cuerdas`}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Filtrar por cuerda</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={filterCuerdas.size === 0}
                onCheckedChange={() => setFilterCuerdas(new Set())}
                onSelect={(e) => e.preventDefault()}
              >
                Todas las cuerdas
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {cuerdaOptions.map(c => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={filterCuerdas.has(c)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => {
                    setFilterCuerdas(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(c); else next.delete(c);
                      return next;
                    });
                  }}
                >
                  Cuerda {c}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {filterCuerdas.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {visibleProjects.length} proyecto{visibleProjects.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Tighter grid + smaller cards. Each card used to be ~200px tall
          with 3 cols max — Dan asked to fit more on a page. Now: more
          columns at every breakpoint above sm, no min-height (cards
          size to their content), reduced padding, smaller gap. The new
          project tile mirrors the same dimensions so it doesn't tower
          over the project cards next to it. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {/* New project card */}
        <button
          onClick={openCreateDialog}
          className="group flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-1.5 transition-colors">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xs font-semibold text-primary">Nuevo proyecto</div>
          <div className="text-[10px] text-muted-foreground text-center">Planificar visitas</div>
        </button>

        {isLoading && projects.length === 0 && (
          <div className="text-sm text-muted-foreground col-span-full text-center py-8">Cargando proyectos...</div>
        )}

        {/* Existing project cards */}
        {visibleProjects.map((p: any) => {
          const expiresIn = Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          const stops = (p.ordered_contact_ids || []).length;
          const url = `${window.location.origin}/r/${p.share_token}`;
          // Count contacts marked as visited. visited is a JSONB shaped
          // { [contactId]: true }, written from the editor and the public
          // /r/ viewer. We only count IDs that are still in the route's
          // ordered list — if someone removed a contact after marking it,
          // the dangling visited entry shouldn't keep the route looking
          // "complete" with fewer stops than visits.
          const orderedIds: string[] = p.ordered_contact_ids || [];
          const visitedMap: Record<string, boolean> = p.visited || {};
          const visitedCount = orderedIds.reduce((n, id) => n + (visitedMap[id] ? 1 : 0), 0);
          const isComplete = stops > 0 && visitedCount === stops;
          // 'Nueva nota' indicator: only the route's creator sees it, and
          // only when notes were updated more recently than the last time
          // they viewed the route. The public viewer (the people walking
          // the route) writes notes; the creator wants a heads-up that
          // someone left a comment without having to open every card.
          // notes_seen_at gets bumped to now() the moment the creator
          // opens the route in RouteEditorPage, which dismisses this pill.
          const isCreator = p.created_by === profile?.id;
          const updatedAt = p.notes_updated_at ? new Date(p.notes_updated_at).getTime() : 0;
          const seenAt = p.notes_seen_at ? new Date(p.notes_seen_at).getTime() : 0;
          const hasUnseenNotes = isCreator && updatedAt > 0 && updatedAt > seenAt;
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/admin/churches/${churchId}/rutas/${p.id}`)}
              className={`border rounded-lg p-3 bg-card hover:bg-card/80 cursor-pointer transition-colors flex flex-col ${
                hasUnseenNotes
                  ? 'border-red-500/60 ring-1 ring-red-500/30'
                  : isComplete
                    ? 'border-green-500/40'
                    : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="text-xs font-semibold truncate">{p.name || 'Sin nombre'}</div>
                    {hasUnseenNotes && (
                      // Red pill that overrides the green 'OK' when both
                      // conditions hit (a route can be both complete and
                      // have a fresh comment). Red takes priority because
                      // unseen feedback is more actionable than knowing
                      // you finished. animate-pulse for the visibility
                      // bump Dan asked for ('algo llamativo').
                      <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/40 animate-pulse">
                        <MessageSquare className="h-2 w-2" />
                        Nueva nota
                      </span>
                    )}
                    {isComplete && !hasUnseenNotes && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30">
                        <Check className="h-2 w-2" />
                        OK
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('es-AR')}
                    {!isCreator && p.creator_name && (
                      <span className="ml-1 text-muted-foreground/70">· {p.creator_name}</span>
                    )}
                  </div>
                </div>
                {isCreator && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  className="text-muted-foreground hover:text-red-400 p-0.5 -mr-0.5 -mt-0.5 rounded"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                )}
              </div>
              {/* Single condensed info line — paradas, optional km, optional min,
                  expiration. Used to be two rows with icons; one row reads
                  faster and saves vertical space. The MapPin icon stays as
                  a visual anchor; the clock got dropped because 'Expira en
                  N días' is unambiguous as text. */}
              <div className="flex-1 text-[11px] text-muted-foreground leading-snug">
                <div className="flex items-center gap-1 flex-wrap">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>
                    {stops} {stops === 1 ? 'parada' : 'paradas'}
                    {stops > 0 && visitedCount > 0 && !isComplete && (
                      <span className="text-green-400 ml-1">· {visitedCount}/{stops}</span>
                    )}
                  </span>
                  {p.total_meters ? <span>· {(p.total_meters / 1000).toFixed(1)} km</span> : null}
                  {p.total_seconds ? <span>· {formatDuration(p.total_seconds)}</span> : null}
                </div>
                <div className="mt-0.5 text-[10px]">
                  Expira en {expiresIn} {expiresIn === 1 ? 'día' : 'días'}
                </div>
              </div>
              <div className="flex gap-1 mt-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1 px-2" onClick={() => navigate(`/admin/churches/${churchId}/rutas/${p.id}`)}>
                  Editar
                </Button>
                {stops > 0 && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(url, '_blank')} title="Abrir link público">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
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
