import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Check, Trash2, Pencil, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { isCourseStage, stageLabel, type ProcessStageKey } from '@/lib/process-stages';
import { normalize } from '@/lib/normalize';
import { formatDateAR } from './helpers';
import type { AttendanceEvent, AttendanceCounts, ContactRow, ProcessRow } from './types';

interface EtapaViewProps {
  stage: ProcessStageKey;
  events: AttendanceEvent[];
  attendanceByEvent: Record<string, AttendanceCounts>;
  enrolled: ProcessRow[];
  enrolledLoading: boolean;
  isPrivileged: boolean;
  userCuerda: string | null;
  userId: string | null;
  churchId: string;
  onTakeAttendance: (ev: AttendanceEvent) => void;
  onEditEvent: (ev: AttendanceEvent) => void;
  onDeleteEvent: (ev: AttendanceEvent) => void;
  onScheduleDate: () => void;
  onEnrolledChanged: () => void;
}

/**
 * Two-column view per etapa: left lists scheduled events with edit/delete
 * + a "take attendance" button; right is the EnrolledList (people in the
 * stage, with cross-cuerda add). Used by every stage tab except Calendario
 * and Resumen.
 */
export const EtapaView = ({
  stage, events, attendanceByEvent, enrolled, enrolledLoading,
  isPrivileged, userCuerda, userId, churchId,
  onTakeAttendance, onEditEvent, onDeleteEvent, onScheduleDate, onEnrolledChanged,
}: EtapaViewProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="border rounded-lg bg-card overflow-hidden h-fit">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <div className="text-sm font-semibold">Fechas programadas</div>
          <span className="text-xs text-muted-foreground">({events.length})</span>
          <div className="flex-1" />
          <Button size="sm" onClick={onScheduleDate} className="gap-1 h-7 text-xs">
            <Plus className="h-3 w-3" /> Programar fecha
          </Button>
        </div>
        {events.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground px-4">
            No hay fechas programadas para {stageLabel(stage)}. Apretá "Programar fecha" para crear una.
          </div>
        ) : (
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {events.map(ev => {
              const c = attendanceByEvent[ev.id] || { present: 0, absent: 0, justified: 0 };
              const total = c.present + c.absent + c.justified;
              return (
                <div key={ev.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="text-[11px] font-semibold tabular-nums w-14 shrink-0">{formatDateAR(ev.event_date)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {ev.title || stageLabel(ev.stage)}
                    </div>
                    {total > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        {c.present}P{c.absent > 0 && ` · ${c.absent}A`}{c.justified > 0 && ` · ${c.justified}J`}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onTakeAttendance(ev)} className="gap-1 h-7 text-xs">
                    <Check className="h-3 w-3" /> Asistencia
                  </Button>
                  <button onClick={() => onEditEvent(ev)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Editar">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDeleteEvent(ev)} className="p-1 text-muted-foreground hover:text-red-400 rounded" title="Eliminar">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EnrolledList
        churchId={churchId}
        stage={stage}
        enrolled={enrolled}
        loading={enrolledLoading}
        isPrivileged={isPrivileged}
        userCuerda={userCuerda}
        userId={userId}
        onChanged={onEnrolledChanged}
      />
    </div>
  );
};

const EnrolledList = ({ churchId, stage, enrolled, loading, isPrivileged, userCuerda, userId, onChanged }: {
  churchId: string;
  stage: ProcessStageKey;
  enrolled: ProcessRow[];
  loading: boolean;
  isPrivileged: boolean;
  userCuerda: string | null;
  userId: string | null;
  onChanged: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [adderOpen, setAdderOpen] = useState(false);
  const [savingDelete, setSavingDelete] = useState<string | null>(null);

  const canEditRow = (row: ProcessRow) => {
    if (isPrivileged) return true;
    // Field roles can only edit rows for contacts in their own cuerda.
    if (!userCuerda) return false;
    return row.contacts?.numero_cuerda === userCuerda;
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return enrolled;
    const t = normalize(search);
    return enrolled.filter(p =>
      normalize(`${p.contacts?.first_name || ''} ${p.contacts?.last_name || ''}`).includes(t) ||
      normalize(p.contacts?.numero_cuerda || '').includes(t),
    );
  }, [enrolled, search]);

  const handleDelete = async (row: ProcessRow) => {
    if (!confirm('¿Sacar a esta persona de la etapa? La asistencia registrada queda intacta.')) return;
    setSavingDelete(row.id);
    try {
      const { error } = await supabase.from('contact_processes').delete().eq('id', row.id);
      if (error) throw error;
      showSuccess('Persona removida');
      onChanged();
    } catch (e: any) {
      showError(e.message || 'Error al remover');
    } finally {
      setSavingDelete(null);
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b">
        <div className="text-sm font-semibold">
          Personas en {stageLabel(stage)}
          <span className="text-muted-foreground font-normal ml-1.5">({enrolled.length})</span>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 w-[220px]" placeholder="Buscar inscriptos..." />
        </div>
        <Button size="sm" onClick={() => setAdderOpen(true)} className="gap-1 h-8 text-xs">
          <UserPlus className="h-3 w-3" /> Agregar persona
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-xs text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          {search ? 'Sin coincidencias.' : 'Nadie cargado en esta etapa todavía.'}
        </div>
      ) : (
        <div className="divide-y">
          {filtered.map(row => {
            const editable = canEditRow(row);
            const isCourse = isCourseStage(stage);
            const presentClases = isCourse
              ? Array.from({ length: 10 }, (_, i) => row.metadata?.[`clase_${i + 1}`]).filter(v => v === 'P').length
              : null;
            const recordedClases = isCourse
              ? Array.from({ length: 10 }, (_, i) => row.metadata?.[`clase_${i + 1}`]).filter(v => v === 'P' || v === 'A').length
              : null;
            return (
              <div key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.contacts?.first_name} {row.contacts?.last_name || ''}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.contacts?.numero_cuerda ? `Cuerda ${row.contacts.numero_cuerda}` : 'Sin cuerda'}
                  </div>
                </div>
                {isCourse && recordedClases !== null && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {presentClases}/{recordedClases} clases
                  </div>
                )}
                {editable && (
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={savingDelete === row.id}
                    className="p-1.5 text-muted-foreground hover:text-red-400 rounded disabled:opacity-50"
                    title="Sacar de la etapa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adderOpen && (
        <AddPersonDialog
          churchId={churchId}
          stage={stage}
          userId={userId}
          existingContactIds={new Set(enrolled.map(e => e.contact_id))}
          onClose={() => setAdderOpen(false)}
          onAdded={() => { setAdderOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
};

const AddPersonDialog = ({ churchId, stage, userId, existingContactIds, onClose, onAdded }: {
  churchId: string;
  stage: ProcessStageKey;
  userId: string | null;
  existingContactIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  // Cross-cuerda search of the church's contacts. Users from any cuerda
  // can ADD a contact to an etapa per Dan's spec — the edit/delete
  // restriction is enforced on the row in the list above.
  const { data: results = [], isLoading } = useQuery<ContactRow[]>({
    queryKey: ['asistencia-add-person-search', churchId, search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      // search_name (migration 0033) is unaccent(lower(first + ' ' + last))
      // maintained by trigger, so the query is accent + case insensitive.
      const t = normalize(search);
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, numero_cuerda')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .ilike('search_name', `%${t}%`)
        .order('first_name')
        .limit(40);
      if (error) throw error;
      return (data || []) as ContactRow[];
    },
    enabled: !!churchId && search.trim().length >= 2,
    staleTime: 15_000,
  });

  const handleAdd = async (contact: ContactRow) => {
    if (existingContactIds.has(contact.id)) {
      showError('Esta persona ya está en la etapa');
      return;
    }
    setAdding(contact.id);
    try {
      // Move (or create) the row to this stage. ON CONFLICT updates an
      // existing row's stage rather than rejecting — a contact can only
      // be in one stage at a time.
      const { error } = await supabase.from('contact_processes')
        .upsert({
          contact_id: contact.id,
          church_id: churchId,
          stage,
          moved_at: new Date().toISOString(),
          moved_by: userId,
          metadata: {},
        }, { onConflict: 'contact_id' });
      if (error) throw error;
      showSuccess(`${contact.first_name} agregado a ${stageLabel(stage)}`);
      onAdded();
    } catch (e: any) {
      showError(e.message || 'Error al agregar');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Agregar persona a {stageLabel(stage)}</DialogTitle>
          <div className="text-xs text-muted-foreground">Buscá por nombre. Cualquier cuerda puede agregar.</div>
        </DialogHeader>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-sm pl-9" placeholder="Nombre o apellido..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {search.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Escribí al menos 2 letras para buscar.</p>
          ) : isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin coincidencias.</p>
          ) : (
            <div className="divide-y">
              {results.map(c => {
                const already = existingContactIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.first_name} {c.last_name || ''}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.numero_cuerda ? `Cuerda ${c.numero_cuerda}` : 'Sin cuerda'}
                      </div>
                    </div>
                    {already ? (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Ya está</span>
                    ) : (
                      <Button size="sm" variant="outline" disabled={adding === c.id} onClick={() => handleAdd(c)} className="h-7 text-xs">
                        {adding === c.id ? 'Agregando…' : 'Agregar'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
