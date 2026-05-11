"use client";
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { showSuccess, showError } from '@/utils/toast';
import { Search, Plus, X, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { normalize } from '@/lib/normalize';
import ContactProfileDialog from '@/components/admin/ContactProfileDialog';

// ─── Stage definitions ───────────────────────────────────────────────────────

const STAGES = [
  { key: 'nuevas_personas_domingos', label: 'Nuevas Personas Domingos', short: 'NP Dom',  color: '#3b82f6' },
  { key: 'nuevas_personas_celulas',  label: 'Nuevas Personas Células',  short: 'NP Cél',  color: '#60a5fa' },
  { key: 'liberacion',               label: 'Liberación',               short: 'Lib',     color: '#8b5cf6' },
  { key: 'pre_encuentro',            label: 'Pre-Encuentro',            short: 'Pre-E',   color: '#f59e0b' },
  { key: 'encuentro',                label: 'Encuentro',                short: 'Enc',     color: '#f97316' },
  { key: 'post_encuentro',           label: 'Post Encuentro',           short: 'PE',      color: '#ef4444' },
  { key: 'abc',                      label: 'ABC',                      short: 'ABC',     color: '#10b981' },
  { key: 'nivel_1',                  label: 'Nivel 1',                  short: 'N1',      color: '#06b6d4' },
  { key: 'nivel_2',                  label: 'Nivel 2',                  short: 'N2',      color: '#ec4899' },
] as const;

type StageKey = typeof STAGES[number]['key'];

type FieldType = 'text' | 'date' | 'boolean' | 'textarea' | 'attendance';

interface StageField {
  key: string;
  label: string;
  type: FieldType;
  cardVisible?: boolean; // show on card face
}

const CLASES: StageField[] = Array.from({ length: 10 }, (_, i) => ({
  key: `clase_${i + 1}`,
  label: `Clase ${i + 1}`,
  type: 'attendance',
}));

const STAGE_FIELDS: Record<StageKey, StageField[]> = {
  nuevas_personas_domingos: [
    { key: 'fecha_asistencia',  label: 'Fecha de asistencia',    type: 'date',    cardVisible: true },
    { key: 'horario',           label: 'Horario',                type: 'text',    cardVisible: true },
    { key: 'como_conectada',    label: 'Cómo fue conectada',     type: 'text' },
    { key: 'quien_invito',      label: 'Quién la invitó',        type: 'text' },
    { key: 'quien_contactara',  label: 'Quién se contactará',    type: 'text',    cardVisible: true },
  ],
  nuevas_personas_celulas: [
    { key: 'fecha_asistencia',  label: 'Fecha de asistencia',    type: 'date',    cardVisible: true },
    { key: 'celula_asistida',   label: 'A qué célula asistió',   type: 'text',    cardVisible: true },
    { key: 'quien_invito',      label: 'Quién la invitó',        type: 'text' },
    { key: 'quien_contactara',  label: 'Quién se contactará',    type: 'text',    cardVisible: true },
  ],
  liberacion: [
    { key: 'consolidadora',     label: 'Consolidadora',          type: 'text',    cardVisible: true },
    { key: 'tiene_hijos',       label: 'Hijos menores de 10 años', type: 'boolean', cardVisible: true },
    { key: 'se_bautiza',        label: 'Se bautiza',             type: 'boolean', cardVisible: true },
    { key: 'fecha_entrega',     label: 'Fecha de entrega',       type: 'date' },
  ],
  pre_encuentro: [
    { key: 'fecha_cierre',      label: 'Fecha cierre liberación', type: 'date',   cardVisible: true },
    { key: 'asiste_ninos',      label: 'Asiste con niños <10',   type: 'boolean', cardVisible: true },
  ],
  encuentro: [
    { key: 'fecha_encuentro',   label: 'Fecha de encuentro',     type: 'date',    cardVisible: true },
    { key: 'consolidadora',     label: 'Consolidadora',          type: 'text',    cardVisible: true },
    { key: 'se_bautiza',        label: 'Se bautiza',             type: 'boolean', cardVisible: true },
    { key: 'razon_no_bautizo',  label: 'Si no, ¿por qué?',      type: 'text' },
    { key: 'asiste_ninos',      label: 'Asiste con niños',       type: 'boolean' },
    { key: 'nombre_nino',       label: 'Nombre del niño',        type: 'text' },
    { key: 'edad_nino',         label: 'Edad del niño',          type: 'text' },
    { key: 'observaciones',     label: 'Observaciones',          type: 'textarea' },
  ],
  post_encuentro: [
    { key: 'consolidadora',     label: 'Consolidadora',          type: 'text',    cardVisible: true },
    { key: 'visita_post',       label: 'Visita post-encuentro',  type: 'text' },
    { key: 'fecha_post',        label: 'Fecha post-encuentro',   type: 'date',    cardVisible: true },
    { key: 'segunda_fecha_post',label: 'Segunda fecha post',     type: 'date' },
  ],
  abc:     [{ key: 'consolidadora', label: 'Consolidadora', type: 'text', cardVisible: true }, ...CLASES],
  nivel_1: [{ key: 'consolidadora', label: 'Consolidadora', type: 'text', cardVisible: true }, ...CLASES],
  nivel_2: [{ key: 'consolidadora', label: 'Consolidadora', type: 'text', cardVisible: true }, ...CLASES],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessContact {
  id: string;
  contact_id: string;
  stage: StageKey;
  moved_at: string;
  metadata: Record<string, any>;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  numero_cuerda: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const boolLabel = (v: any) => v === true || v === 'true' ? 'Sí' : v === false || v === 'false' ? 'No' : '—';
const attendanceClasses = (meta: Record<string, any>) => {
  const clases = CLASES.map(c => meta[c.key]);
  const done = clases.filter(v => v === 'P').length;
  const total = 10;
  const bar = Array.from({ length: total }, (_, i) => {
    const v = clases[i];
    return v === 'P' ? '▓' : v === 'A' ? '░' : '·';
  }).join('');
  return { bar, done, total };
};

// ─── Stage-specific metadata card summary ─────────────────────────────────────

const CardMeta: React.FC<{ stage: StageKey; meta: Record<string, any> }> = ({ stage, meta }) => {
  const fields = STAGE_FIELDS[stage];
  const cardFields = fields.filter(f => f.cardVisible);

  if (['abc', 'nivel_1', 'nivel_2'].includes(stage)) {
    const { bar, done, total } = attendanceClasses(meta);
    return (
      <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
        {meta.consolidadora && <div className="truncate">👤 {meta.consolidadora}</div>}
        <div className="font-mono tracking-tight">{bar} {done}/{total}</div>
      </div>
    );
  }

  const lines = cardFields
    .map(f => {
      const v = meta[f.key];
      if (v == null || v === '') return null;
      const display = f.type === 'boolean' ? boolLabel(v) : String(v);
      return `${f.label}: ${display}`;
    })
    .filter(Boolean);

  if (!lines.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {lines.map((l, i) => (
        <div key={i} className="text-[10px] text-muted-foreground truncate">{l}</div>
      ))}
    </div>
  );
};

// ─── Person detail dialog with stage tabs ─────────────────────────────────────

const PersonDetailDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pc: ProcessContact | null;
  onSave: (processId: string, meta: Record<string, any>) => void;
  saving: boolean;
  onOpenProfile: (contactId: string) => void;
}> = ({ open, onOpenChange, pc, onSave, saving, onOpenProfile }) => {
  const [local, setLocal] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<StageKey | null>(null);

  React.useEffect(() => {
    if (pc) {
      setLocal({ ...(pc.metadata || {}) });
      setActiveTab(pc.stage);
    }
  }, [pc]);

  if (!pc) return null;

  const currentStageIdx = STAGES.findIndex(s => s.key === pc.stage);
  const set = (key: string, val: any) => setLocal(prev => ({ ...prev, [key]: val }));

  const renderField = (f: StageField) => {
    const val = local[f.key] ?? '';
    if (f.type === 'boolean') {
      return (
        <div key={f.key} className="flex items-center justify-between py-1.5 border-b border-border/30">
          <label className="text-sm text-muted-foreground">{f.label}</label>
          <div className="flex gap-1">
            {['Sí', 'No'].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set(f.key, opt === 'Sí' ? true : false)}
                className={`px-2.5 py-0.5 rounded text-xs border transition-colors ${
                  (opt === 'Sí' && (val === true || val === 'true')) ||
                  (opt === 'No' && (val === false || val === 'false'))
                    ? 'bg-primary/20 border-primary text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === 'attendance') {
      const v = local[f.key] ?? '';
      return (
        <div key={f.key} className="flex items-center justify-between py-1 border-b border-border/20">
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <div className="flex gap-1">
            {['P', 'A', ''].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set(f.key, opt)}
                className={`w-8 py-0.5 rounded text-xs border transition-colors ${
                  v === opt
                    ? opt === 'P' ? 'bg-green-500/20 border-green-500 text-green-400 font-medium'
                      : opt === 'A' ? 'bg-red-500/20 border-red-500 text-red-400 font-medium'
                      : 'bg-muted border-muted-foreground text-muted-foreground font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {opt === '' ? '—' : opt}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === 'textarea') {
      return (
        <div key={f.key} className="space-y-1 py-1.5 border-b border-border/30">
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <textarea
            className="w-full rounded border bg-background text-sm p-2 resize-none"
            rows={2}
            value={val}
            onChange={e => set(f.key, e.target.value)}
          />
        </div>
      );
    }
    return (
      <div key={f.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30">
        <label className="text-sm text-muted-foreground shrink-0">{f.label}</label>
        <Input
          type={f.type === 'date' ? 'date' : 'text'}
          className="h-7 text-xs w-48"
          value={val}
          onChange={e => set(f.key, e.target.value)}
        />
      </div>
    );
  };

  const tabStage = activeTab || pc.stage;
  const tabFields = STAGE_FIELDS[tabStage] || [];
  const tabIdx = STAGES.findIndex(s => s.key === tabStage);
  const isFutureStage = tabIdx > currentStageIdx;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b shrink-0">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div>
              <h2 className="text-base font-semibold">{pc.first_name} {pc.last_name || ''}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {pc.numero_cuerda && <span className="text-xs text-muted-foreground">Cuerda {pc.numero_cuerda}</span>}
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-primary" onClick={() => { onOpenChange(false); onOpenProfile(pc.contact_id); }}>
                  Ver perfil →
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stage tabs — scrollable horizontal strip */}
        <div className="border-b shrink-0 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-0">
            {STAGES.map((s, idx) => {
              const isActive = s.key === tabStage;
              const isCurrent = s.key === pc.stage;
              const isPast = idx < currentStageIdx;
              const isFuture = idx > currentStageIdx;
              // Check if any data exists for this stage
              const stageFields = STAGE_FIELDS[s.key];
              const hasData = stageFields.some(f => {
                const v = local[f.key];
                return v != null && v !== '' && v !== false;
              });
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveTab(s.key)}
                  className={`shrink-0 px-2.5 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-foreground'
                      : isCurrent
                        ? 'border-transparent text-foreground/80 hover:text-foreground'
                        : isPast && hasData
                          ? 'border-transparent text-muted-foreground hover:text-foreground'
                          : 'border-transparent text-muted-foreground/40 hover:text-muted-foreground'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isFuture && !hasData ? '#555' : s.color }} />
                    {s.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isFutureStage && !STAGE_FIELDS[tabStage].some(f => { const v = local[f.key]; return v != null && v !== '' && v !== false; }) ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Esta persona aún no llegó a esta etapa.
            </div>
          ) : (
            <div className="space-y-0">
              {tabFields.map(renderField)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={() => onSave(pc.id, local)} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const ProcesosPage = () => {
  const { churchId } = useParams<{ churchId: string }>();
  const { session, profile } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addDialogStage, setAddDialogStage] = useState<StageKey | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [dragItem, setDragItem] = useState<{ id: string; stage: StageKey } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [editingPc, setEditingPc] = useState<ProcessContact | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);

  const isGlobal = profile?.role && ['admin', 'general', 'pastor', 'supervisor'].includes(profile.role);
  const userCuerda = profile?.numero_cuerda || null;

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: processContacts, isLoading } = useQuery<ProcessContact[]>({
    queryKey: ['processes', churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_processes')
        .select('id, contact_id, stage, moved_at, metadata')
        .eq('church_id', churchId!);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const contactIds = data.map(d => d.contact_id);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, numero_cuerda')
        .in('id', contactIds);
      const contactMap = new Map((contacts || []).map(c => [c.id, c]));

      return data.map(d => {
        const c = contactMap.get(d.contact_id);
        return {
          id: d.id,
          contact_id: d.contact_id,
          stage: d.stage as StageKey,
          moved_at: d.moved_at,
          metadata: (d.metadata as Record<string, any>) || {},
          first_name: c?.first_name || '?',
          last_name: c?.last_name || null,
          phone: c?.phone || null,
          numero_cuerda: c?.numero_cuerda || null,
        };
      });
    },
    enabled: !!churchId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: availableContacts } = useQuery<{ id: string; first_name: string; last_name: string | null; phone: string | null }[]>({
    queryKey: ['process-available-contacts', churchId],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, numero_cuerda')
        .eq('church_id', churchId!)
        .is('deleted_at', null);
      if (!isGlobal && userCuerda) q = q.eq('numero_cuerda', userCuerda);

      const { data: allContacts } = await q;
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

  // ── Mutations ─────────────────────────────────────────────────────────────

  const moveMutation = useMutation({
    mutationFn: async ({ processId, newStage }: { processId: string; newStage: StageKey }) => {
      const { error } = await supabase
        .from('contact_processes')
        .update({ stage: newStage, moved_at: new Date().toISOString(), moved_by: session?.user?.id })
        .eq('id', processId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['processes', churchId] }),
    onError: (err: any) => showError(err.message || 'Error al mover contacto'),
  });

  const addMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: StageKey }) => {
      const { error } = await supabase
        .from('contact_processes')
        .insert({ contact_id: contactId, church_id: churchId!, stage, moved_by: session?.user?.id, metadata: {} });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', churchId] });
      queryClient.invalidateQueries({ queryKey: ['process-available-contacts', churchId] });
      showSuccess('Contacto agregado al proceso');
    },
    onError: (err: any) => showError(err.message || 'Error al agregar contacto'),
  });

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

  const saveMetadata = async (processId: string, meta: Record<string, any>) => {
    setSavingMeta(true);
    try {
      const { error } = await supabase
        .from('contact_processes')
        .update({ metadata: meta })
        .eq('id', processId);
      if (error) { showError(error.message); return; }
      queryClient.invalidateQueries({ queryKey: ['processes', churchId] });
      showSuccess('Datos guardados');
      setEditingPc(null);
    } finally {
      setSavingMeta(false);
    }
  };

  // ── Groups ────────────────────────────────────────────────────────────────

  const stageGroups = useMemo(() => {
    const groups: Record<StageKey, ProcessContact[]> = {} as any;
    STAGES.forEach(s => { groups[s.key] = []; });
    (processContacts || []).forEach(pc => {
      if (!isGlobal && userCuerda && pc.numero_cuerda !== userCuerda) return;
      const q = normalize(search);
      if (q && !normalize(`${pc.first_name} ${pc.last_name || ''}`).includes(q) &&
          !normalize(pc.phone || '').includes(q)) return;
      if (groups[pc.stage]) groups[pc.stage].push(pc);
    });
    Object.values(groups).forEach(arr =>
      arr.sort((a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime())
    );
    return groups;
  }, [processContacts, search, isGlobal, userCuerda]);

  const totalInPipeline = (processContacts || []).length;

  // ── Drag ─────────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string, stage: StageKey) => {
    setDragItem({ id, stage });
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, stage: StageKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };
  const handleDrop = (e: React.DragEvent, targetStage: StageKey) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragItem || dragItem.stage === targetStage) { setDragItem(null); return; }
    moveMutation.mutate({ processId: dragItem.id, newStage: targetStage });
    setDragItem(null);
  };

  // ── Available contacts filter ─────────────────────────────────────────────

  const filteredAvailable = useMemo(() => {
    if (!availableContacts) return [];
    if (!contactSearch) return availableContacts.slice(0, 50);
    const q = normalize(contactSearch);
    return availableContacts.filter(c =>
      normalize(`${c.first_name} ${c.last_name || ''}`).includes(q) ||
      normalize(c.phone || '').includes(q)
    ).slice(0, 50);
  }, [availableContacts, contactSearch]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}m`;
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

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-2" style={{ minWidth: STAGES.length * 175 }}>
          {STAGES.map(stage => {
            const cards = stageGroups[stage.key];
            const isOver = dragOverStage === stage.key;
            return (
              <div
                key={stage.key}
                className={`flex flex-col flex-1 rounded-lg border transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}
                style={{ minWidth: 168 }}
                onDragOver={e => handleDragOver(e, stage.key)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={e => handleDrop(e, stage.key)}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-2 py-2 border-b" style={{ borderBottomColor: stage.color + '40' }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs font-semibold truncate">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{cards.length}</span>
                    <button
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Agregar persona"
                      onClick={() => { setAddDialogStage(stage.key); setContactSearch(''); }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                  {cards.map(pc => (
                    <div
                      key={pc.id}
                      draggable
                      onDragStart={e => handleDragStart(e, pc.id, pc.stage)}
                      className="group rounded-md border bg-card px-2 py-2 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          {/* Name → stage data dialog with tabs */}
                          <button
                            className="text-xs font-medium truncate text-left hover:text-primary hover:underline transition-colors"
                            onClick={e => { e.stopPropagation(); setEditingPc(pc); }}
                          >
                            {pc.first_name} {pc.last_name || ''}
                          </button>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Remove */}
                          <button
                            className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                            title="Quitar del proceso"
                            onClick={e => { e.stopPropagation(); removeMutation.mutate(pc.id); }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Stage-specific metadata summary */}
                      <CardMeta stage={pc.stage} meta={pc.metadata} />

                      <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/50">
                        <span>{timeAgo(pc.moved_at)}</span>
                        {pc.numero_cuerda && <span className="font-mono">C{pc.numero_cuerda}</span>}
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground/50">Sin personas</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add contact dialog */}
      <Dialog open={!!addDialogStage} onOpenChange={o => { if (!o) setAddDialogStage(null); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Agregar a {STAGES.find(s => s.key === addDialogStage)?.label}</DialogTitle>
            <DialogDescription>Seleccioná un contacto para agregar a esta etapa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9 text-sm" placeholder="Buscar contacto..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} autoFocus />
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {filteredAvailable.map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                  onClick={() => { if (addDialogStage) addMutation.mutate({ contactId: c.id, stage: addDialogStage }); }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.first_name} {c.last_name || ''}</p>
                    {c.phone && <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>}
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

      {/* Person detail dialog (stage data with tabs) */}
      <PersonDetailDialog
        open={!!editingPc}
        onOpenChange={o => { if (!o) setEditingPc(null); }}
        pc={editingPc}
        onSave={saveMetadata}
        saving={savingMeta}
        onOpenProfile={(contactId) => setSelectedContactId(contactId)}
      />

      {/* Contact profile */}
      <ContactProfileDialog
        open={!!selectedContactId}
        onOpenChange={o => { if (!o) { setSelectedContactId(null); queryClient.invalidateQueries({ queryKey: ['processes', churchId] }); } }}
        contactId={selectedContactId || ''}
        churchId={churchId!}
      />
    </div>
  );
};

export default ProcesosPage;
