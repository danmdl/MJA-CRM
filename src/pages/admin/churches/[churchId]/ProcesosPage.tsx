"use client";
import React, { useState, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { showSuccess, showError } from '@/utils/toast';
import { Search, Plus, X, GripVertical, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { normalize } from '@/lib/normalize';

// Pipeline stages in order
const STAGES = [
  { key: 'nuevas_personas', label: 'Nuevas Personas', color: '#3b82f6' },
  { key: 'liberacion', label: 'Liberación', color: '#8b5cf6' },
  { key: 'encuentro', label: 'Encuentro', color: '#f59e0b' },
  { key: 'post_encuentro', label: 'Post Encuentro', color: '#f97316' },
  { key: 'abc', label: 'ABC', color: '#10b981' },
  { key: 'nivel_1', label: 'Nivel 1', color: '#06b6d4' },
  { key: 'nivel_2', label: 'Nivel 2', color: '#ec4899' },
] as const;

type StageKey = typeof STAGES[number]['key'];

interface ProcessContact {
  id: string; // contact_processes.id
  contact_id: string;
  stage: StageKey;
  moved_at: string;
  notes: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  numero_cuerda: string | null;
  responsable_name: string | null;
}

const ProcesosPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addDialogStage, setAddDialogStage] = useState<StageKey | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [dragItem, setDragItem] = useState<{ id: string; stage: StageKey } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);

  // Fetch all process entries for this church, joined with contact data
  const { data: processContacts, isLoading } = useQuery<ProcessContact[]>({
    queryKey: ['processes', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_processes')
        .select('id, contact_id, stage, moved_at, notes')
        .eq('church_id', churchId!);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch contact details for all contact_ids
      const contactIds = data.map(d => d.contact_id);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, numero_cuerda, responsable_id')
        .in('id', contactIds);

      // Fetch responsable names
      const respIds = (contacts || []).map(c => c.responsable_id).filter(Boolean) as string[];
      const { data: profiles } = respIds.length > 0
        ? await supabase.from('profiles').select('id, first_name, last_name').in('id', respIds)
        : { data: [] };
      const profileMap = new Map((profiles || []).map(p => [p.id, `${p.first_name} ${p.last_name || ''}`.trim()]));
      const contactMap = new Map((contacts || []).map(c => [c.id, c]));

      return data.map(d => {
        const c = contactMap.get(d.contact_id);
        return {
          id: d.id,
          contact_id: d.contact_id,
          stage: d.stage as StageKey,
          moved_at: d.moved_at,
          notes: d.notes,
          first_name: c?.first_name || '?',
          last_name: c?.last_name || null,
          phone: c?.phone || null,
          numero_cuerda: c?.numero_cuerda || null,
          responsable_name: c?.responsable_id ? profileMap.get(c.responsable_id) || null : null,
        };
      });
    },
    enabled: !!churchId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Contacts NOT yet in any process (for the add dialog)
  const { data: availableContacts } = useQuery<{ id: string; first_name: string; last_name: string | null; phone: string | null }[]>({
    queryKey: ['process-available-contacts', churchId],
    queryFn: async () => {
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .eq('church_id', churchId!)
        .is('deleted_at', null);

      const { data: inProcess } = await supabase
        .from('contact_processes')
        .select('contact_id')
        .eq('church_id', churchId!);

      const usedIds = new Set((inProcess || []).map(p => p.contact_id));
      return (allContacts || []).filter(c => !usedIds.has(c.id));
    },
    enabled: !!churchId && !!addDialogStage,
    staleTime: 10_000,
  });

  // Move contact to a different stage
  const moveMutation = useMutation({
    mutationFn: async ({ processId, newStage }: { processId: string; newStage: StageKey }) => {
      const { error } = await supabase
        .from('contact_processes')
        .update({ stage: newStage, moved_at: new Date().toISOString(), moved_by: session?.user?.id })
        .eq('id', processId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', churchId] });
    },
    onError: (err: any) => showError(err.message || 'Error al mover contacto'),
  });

  // Add contact to a stage
  const addMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: StageKey }) => {
      const { error } = await supabase
        .from('contact_processes')
        .insert({ contact_id: contactId, church_id: churchId!, stage, moved_by: session?.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', churchId] });
      queryClient.invalidateQueries({ queryKey: ['process-available-contacts', churchId] });
      showSuccess('Contacto agregado al proceso');
    },
    onError: (err: any) => showError(err.message || 'Error al agregar contacto'),
  });

  // Remove contact from pipeline
  const removeMutation = useMutation({
    mutationFn: async (processId: string) => {
      const { error } = await supabase.from('contact_processes').delete().eq('id', processId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', churchId] });
      queryClient.invalidateQueries({ queryKey: ['process-available-contacts', churchId] });
      showSuccess('Contacto removido del proceso');
    },
    onError: (err: any) => showError(err.message || 'Error al remover'),
  });

  // Group by stage
  const stageGroups = useMemo(() => {
    const groups: Record<StageKey, ProcessContact[]> = {} as any;
    STAGES.forEach(s => { groups[s.key] = []; });
    (processContacts || []).forEach(pc => {
      const q = normalize(search);
      if (q && !normalize(`${pc.first_name} ${pc.last_name || ''}`).includes(q) &&
          !normalize(pc.phone || '').includes(q) &&
          !normalize(pc.numero_cuerda || '').includes(q)) return;
      if (groups[pc.stage]) groups[pc.stage].push(pc);
    });
    // Sort each group by moved_at desc
    Object.values(groups).forEach(arr => arr.sort((a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime()));
    return groups;
  }, [processContacts, search]);

  const totalInPipeline = (processContacts || []).length;

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string, stage: StageKey) => {
    setDragItem({ id, stage });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stage: StageKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => { setDragOverStage(null); };

  const handleDrop = (e: React.DragEvent, targetStage: StageKey) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragItem || dragItem.stage === targetStage) { setDragItem(null); return; }
    moveMutation.mutate({ processId: dragItem.id, newStage: targetStage });
    setDragItem(null);
  };

  // Filtered available contacts for add dialog
  const filteredAvailable = useMemo(() => {
    if (!availableContacts) return [];
    if (!contactSearch) return availableContacts.slice(0, 50);
    const q = normalize(contactSearch);
    return availableContacts.filter(c =>
      normalize(`${c.first_name} ${c.last_name || ''}`).includes(q) ||
      normalize(c.phone || '').includes(q)
    ).slice(0, 50);
  }, [availableContacts, contactSearch]);

  // Time ago helper
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    return `${months}m`;
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando procesos...</div>;

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Procesos</h1>
          <p className="text-sm text-muted-foreground">{totalInPipeline} persona{totalInPipeline !== 1 ? 's' : ''} en el pipeline</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Buscar persona..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: STAGES.length * 240 }}>
          {STAGES.map(stage => {
            const cards = stageGroups[stage.key];
            const isOver = dragOverStage === stage.key;
            return (
              <div
                key={stage.key}
                className={`flex flex-col rounded-lg border transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}
                style={{ width: 260, minWidth: 240, flexShrink: 0 }}
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderBottomColor: stage.color + '40' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">{cards.length}</span>
                    <button
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Agregar persona"
                      onClick={() => { setAddDialogStage(stage.key); setContactSearch(''); }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                  {cards.map(pc => (
                    <div
                      key={pc.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, pc.id, pc.stage)}
                      className="group rounded-md border bg-card px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="text-sm font-medium truncate">{pc.first_name} {pc.last_name || ''}</span>
                        </div>
                        <button
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all shrink-0"
                          title="Quitar del proceso"
                          onClick={() => removeMutation.mutate(pc.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {pc.numero_cuerda && <span className="font-mono">🎵 {pc.numero_cuerda}</span>}
                        {pc.responsable_name && <span className="truncate max-w-[120px]">👤 {pc.responsable_name}</span>}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/60">
                        <span>{timeAgo(pc.moved_at)}</span>
                        {pc.phone && <span className="font-mono truncate max-w-[100px]">{pc.phone}</span>}
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground/50">
                      Sin personas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add contact to stage dialog */}
      <Dialog open={!!addDialogStage} onOpenChange={(o) => { if (!o) setAddDialogStage(null); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Agregar a {STAGES.find(s => s.key === addDialogStage)?.label}</DialogTitle>
            <DialogDescription>Seleccioná contactos para agregar a esta etapa del proceso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Buscar contacto..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {filteredAvailable.map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                  onClick={() => {
                    if (addDialogStage) addMutation.mutate({ contactId: c.id, stage: addDialogStage });
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.first_name} {c.last_name || ''}</p>
                      {c.phone && <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
              {filteredAvailable.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">
                  {contactSearch ? 'No se encontraron contactos' : 'Todos los contactos ya están en un proceso'}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProcesosPage;
