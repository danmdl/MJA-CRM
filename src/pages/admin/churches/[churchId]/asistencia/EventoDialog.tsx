import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PROCESS_STAGES, type ProcessStageKey } from '@/lib/process-stages';
import type { AttendanceEvent } from './types';

interface EventoDialogProps {
  churchId: string;
  cuerdas: { id: string; numero: string; is_church_cuerda: boolean | null }[];
  cells: { id: string; name: string; cuerda_id: string | null }[];
  userId: string | null;
  userCuerdaNumero: string | null;
  isPrivileged: boolean;
  defaultStage: ProcessStageKey;
  defaultDate: string | null;
  existing: AttendanceEvent | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EventoDialog = ({
  churchId, cuerdas, cells, userId, userCuerdaNumero, isPrivileged,
  defaultStage, defaultDate, existing, onClose, onSaved,
}: EventoDialogProps) => {
  const userCuerdaId = useMemo(() => cuerdas.find(c => c.numero === userCuerdaNumero)?.id || null, [cuerdas, userCuerdaNumero]);

  const [stage, setStage] = useState<ProcessStageKey>(existing?.stage || defaultStage);
  const [date, setDate] = useState(existing?.event_date || defaultDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(existing?.event_time?.slice(0, 5) || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [cuerdaId, setCuerdaId] = useState<string | null>(
    existing?.cuerda_id ?? (isPrivileged ? null : userCuerdaId),
  );
  const [cellId, setCellId] = useState<string | null>(existing?.cell_id || null);
  const [saving, setSaving] = useState(false);

  const visibleCells = useMemo(
    () => cells.filter(c => !cuerdaId || c.cuerda_id === cuerdaId),
    [cells, cuerdaId],
  );

  const save = async () => {
    if (!date) { showError('Falta la fecha'); return; }
    setSaving(true);
    try {
      const payload = {
        church_id: churchId,
        stage,
        event_date: date,
        event_time: time || null,
        title: title.trim() || null,
        notes: notes.trim() || null,
        cuerda_id: cuerdaId,
        cell_id: cellId,
      };
      if (existing) {
        const { error } = await supabase.from('attendance_events').update(payload).eq('id', existing.id);
        if (error) throw error;
        showSuccess('Evento actualizado');
      } else {
        const { error } = await supabase.from('attendance_events').insert({ ...payload, created_by: userId });
        if (error) throw error;
        showSuccess('Evento creado');
      }
      onSaved();
    } catch (e: any) {
      showError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{existing ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Etapa</Label>
            <select value={stage} onChange={e => setStage(e.target.value as ProcessStageKey)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              {PROCESS_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Horario (opcional)</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Título (opcional)</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Domingo 14/05, Célula de Joel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cuerda</Label>
              {isPrivileged ? (
                <select value={cuerdaId || ''} onChange={e => { setCuerdaId(e.target.value || null); setCellId(null); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Toda la iglesia</option>
                  {cuerdas.filter(c => !c.is_church_cuerda).map(c => (
                    <option key={c.id} value={c.id}>Cuerda {c.numero}</option>
                  ))}
                </select>
              ) : (
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                  {userCuerdaNumero ? `Cuerda ${userCuerdaNumero}` : 'Tu cuerda'}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Célula (opcional)</Label>
              <select value={cellId || ''} onChange={e => setCellId(e.target.value || null)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">Ninguna</option>
                {visibleCells.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
