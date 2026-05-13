import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, X as XIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { isCourseStage, stageColor, stageLabel } from '@/lib/process-stages';
import { normalize } from '@/lib/normalize';
import { formatDateAR } from './helpers';
import type { AttendanceEvent, AttendanceRow } from './types';

interface TomarAsistenciaDialogProps {
  event: AttendanceEvent;
  churchId: string;
  userCuerda: string | null;
  isPrivileged: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const TomarAsistenciaDialog = ({
  event, churchId, userCuerda, isPrivileged, onClose, onSaved,
}: TomarAsistenciaDialogProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusById, setStatusById] = useState<Record<string, 'present' | 'absent' | 'justified' | undefined>>({});
  const [savingFor, setSavingFor] = useState<string | null>(null);

  // Pull contacts from the enrolled list for this stage rather than every
  // contact in the church — taking attendance is bounded to who is actually
  // in the etapa. Cross-cuerda since the etapa list is shared across cuerdas.
  const { data: enrolled = [], isLoading } = useQuery<{ contact_id: string; first_name: string; last_name: string | null; numero_cuerda: string | null }[]>({
    queryKey: ['asistencia-take-list', churchId, event.stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_processes')
        .select('contact_id, contacts:contact_id ( first_name, last_name, numero_cuerda )')
        .eq('church_id', churchId)
        .eq('stage', event.stage);
      if (error) throw error;
      return ((data || []) as any).map((r: any) => ({
        contact_id: r.contact_id,
        first_name: r.contacts?.first_name || '?',
        last_name: r.contacts?.last_name || null,
        numero_cuerda: r.contacts?.numero_cuerda || null,
      }));
    },
    staleTime: 30_000,
  });

  const { data: existing = [], isLoading: existingLoading } = useQuery<AttendanceRow[]>({
    queryKey: ['attendance-rows', event.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_attendance')
        .select('id, event_id, contact_id, status')
        .eq('event_id', event.id);
      if (error) throw error;
      return (data || []) as AttendanceRow[];
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (existing.length === 0) return;
    const next: Record<string, 'present' | 'absent' | 'justified'> = {};
    existing.forEach(r => { next[r.contact_id] = r.status; });
    setStatusById(prev => ({ ...prev, ...next }));
  }, [existing]);

  // Default visible list scopes by the event's cuerda (if any), then by
  // the user's cuerda when not privileged. Privileged see all enrolled
  // across cuerdas.
  const visible = useMemo(() => {
    let list = enrolled;
    if (!isPrivileged && userCuerda) {
      list = list.filter(c => c.numero_cuerda === userCuerda);
    }
    if (search.trim()) {
      const t = normalize(search);
      list = list.filter(c => normalize(`${c.first_name} ${c.last_name || ''}`).includes(t));
    }
    return list;
  }, [enrolled, isPrivileged, userCuerda, search]);

  const mark = async (contactId: string, status: 'present' | 'absent' | 'justified') => {
    setSavingFor(contactId);
    try {
      const { error } = await supabase
        .from('contact_attendance')
        .upsert({ event_id: event.id, contact_id: contactId, status }, { onConflict: 'event_id,contact_id' });
      if (error) throw error;
      setStatusById(prev => ({ ...prev, [contactId]: status }));
      queryClient.invalidateQueries({ queryKey: ['attendance-rows', event.id] });
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al guardar');
    } finally {
      setSavingFor(null);
    }
  };

  const clearMark = async (contactId: string) => {
    setSavingFor(contactId);
    try {
      const row = existing.find(r => r.contact_id === contactId);
      if (row) {
        const { error } = await supabase.from('contact_attendance').delete().eq('id', row.id);
        if (error) throw error;
      }
      setStatusById(prev => { const next = { ...prev }; delete next[contactId]; return next; });
      queryClient.invalidateQueries({ queryKey: ['attendance-rows', event.id] });
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al limpiar');
    } finally {
      setSavingFor(null);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>
            Asistencia · {event.title || stageLabel(event.stage)}
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase text-white"
                  style={{ background: stageColor(event.stage) }}>
              {stageLabel(event.stage)}
            </span>
            <span>{formatDateAR(event.event_date)}{event.event_time ? ` · ${event.event_time.slice(0,5)}` : ''}</span>
            {isCourseStage(event.stage) && (
              <span className="text-amber-400">(Etapa con clases — clase_1..10 se carga en Procesos)</span>
            )}
          </div>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar inscripto..." className="pl-9 h-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {(isLoading || existingLoading) ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {enrolled.length === 0
                ? 'Nadie está cargado en esta etapa todavía. Agregalos desde la lista.'
                : 'Sin coincidencias en tu cuerda.'}
            </div>
          ) : (
            <div className="divide-y">
              {visible.map(c => {
                const status = statusById[c.contact_id];
                return (
                  <div key={c.contact_id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      {c.numero_cuerda && <div className="text-[10px] text-muted-foreground">Cuerda {c.numero_cuerda}</div>}
                    </div>
                    <MarkBtn label="P" title="Presente" active={status === 'present'} color="green" onClick={() => mark(c.contact_id, 'present')} loading={savingFor === c.contact_id} />
                    <MarkBtn label="A" title="Ausente" active={status === 'absent'} color="red" onClick={() => mark(c.contact_id, 'absent')} loading={savingFor === c.contact_id} />
                    <MarkBtn label="J" title="Justificado" active={status === 'justified'} color="amber" onClick={() => mark(c.contact_id, 'justified')} loading={savingFor === c.contact_id} />
                    {status && (
                      <button onClick={() => clearMark(c.contact_id)} className="p-1 text-muted-foreground hover:text-foreground" title="Limpiar">
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="px-6 py-3 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Las marcas se guardan al instante.</div>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MarkBtn = ({ label, title, active, color, onClick, loading }: {
  label: string;
  title: string;
  active: boolean;
  color: 'green' | 'red' | 'amber';
  onClick: () => void;
  loading: boolean;
}) => {
  const baseClass = `w-7 h-7 rounded text-[11px] font-bold border transition-colors disabled:opacity-50`;
  const palette = {
    green: active ? 'bg-green-500 text-white border-green-500' : 'border-green-500/40 text-green-400 hover:bg-green-500/10',
    red: active ? 'bg-red-500 text-white border-red-500' : 'border-red-500/40 text-red-400 hover:bg-red-500/10',
    amber: active ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10',
  }[color];
  return (
    <button onClick={onClick} disabled={loading} title={title} className={`${baseClass} ${palette}`}>
      {label}
    </button>
  );
};
