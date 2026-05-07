"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Trash2, Merge, X, AlertTriangle } from 'lucide-react';

// Fields we present in the merge dialog. Order matches what's most useful to
// see at a glance — identity first, then contact, then context. id /
// church_id / created_at / created_by / deleted_* / pool_assigned_* are
// administrative and don't get user-driven merging; they're handled by the
// merge logic itself (created_at: keep oldest's; church_id: invariant; etc).
const MERGEABLE_FIELDS: Array<{ key: keyof ContactRow; label: string }> = [
  { key: 'first_name', label: 'Nombre' },
  { key: 'last_name', label: 'Apellido' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'sexo', label: 'Sexo' },
  { key: 'edad', label: 'Edad' },
  { key: 'date_of_birth', label: 'Fecha de nacimiento' },
  { key: 'estado_civil', label: 'Estado civil' },
  { key: 'address', label: 'Dirección' },
  { key: 'apartment_number', label: 'Depto/Piso' },
  { key: 'barrio', label: 'Barrio' },
  { key: 'zona', label: 'Zona (texto)' },
  { key: 'zona_id', label: 'Zona (ID)' },
  { key: 'lat', label: 'Latitud' },
  { key: 'lng', label: 'Longitud' },
  { key: 'numero_cuerda', label: 'Cuerda' },
  { key: 'cell_id', label: 'Célula' },
  { key: 'responsable_id', label: 'Responsable' },
  { key: 'conector', label: 'Conector' },
  { key: 'leader_assigned', label: 'Líder asignado' },
  { key: 'fecha_contacto', label: 'Fecha de contacto' },
  { key: 'estado_seguimiento', label: 'Estado de seguimiento' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'pedido_de_oracion', label: 'Pedido de oración' },
];

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email?: string | null;
  phone: string | null;
  cell_id: string | null;
  created_at: string | null;
  address: string | null;
  apartment_number: string | null;
  barrio: string | null;
  leader_assigned: string | null;
  date_of_birth: string | null;
  fecha_contacto: string | null;
  sexo: string | null;
  estado_civil: string | null;
  observaciones: string | null;
  pedido_de_oracion: string | null;
  conector: string | null;
  edad: number | null;
  numero_cuerda: string | null;
  zona: string | null;
  zona_id: string | null;
  estado_seguimiento: string | null;
  lat: number | null;
  lng: number | null;
  responsable_id: string | null;
  church_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** All contacts in the dup group (same normalized first+last name). 2+ entries. */
  group: ContactRow[];
  /** Current user id, used as dismissed_by when discarding. */
  userId: string | null;
  /** Called after a successful merge or dismiss so the parent can refetch. */
  onResolved: () => void;
}

const isEmpty = (v: any) => v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');

const fmt = (v: any) => {
  if (isEmpty(v)) return <span className="text-muted-foreground italic text-xs">— vacío —</span>;
  if (typeof v === 'string' && v.length > 60) return <span className="break-words">{v}</span>;
  return <span>{String(v)}</span>;
};

const DuplicateMergeDialog: React.FC<Props> = ({ open, onOpenChange, group, userId, onResolved }) => {
  // The user picks ONE survivor. By default we pick the oldest contact (the
  // one with the earliest created_at) — they've usually accumulated the most
  // history (logs, processes, transfers) and that's what the user will want
  // to keep as the canonical record.
  const [survivorId, setSurvivorId] = useState<string>('');

  // For each mergeable field, which contact's value should win. Keyed by the
  // field name. Default for each field is computed when the group / survivor
  // changes: "the survivor's value if it has one, else the first non-empty
  // value among the others". Users can override per-field with the radio.
  const [fieldChoices, setFieldChoices] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || group.length === 0) return;
    // Pick oldest as default survivor.
    const oldest = [...group].sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const bt = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      return at - bt;
    })[0];
    setSurvivorId(oldest.id);
  }, [open, group]);

  // Recompute defaults whenever the survivor changes. The rule: for each
  // field, if the survivor already has a non-empty value, keep it; otherwise
  // pick the first non-empty value from any other contact in the group. This
  // is the "merge fills the gaps" semantic Dan asked for. The user can still
  // override any individual field via the radios in the table.
  useEffect(() => {
    if (!survivorId || group.length === 0) return;
    const survivor = group.find(c => c.id === survivorId);
    if (!survivor) return;
    const next: Record<string, string> = {};
    for (const { key } of MERGEABLE_FIELDS) {
      if (!isEmpty(survivor[key])) {
        next[key as string] = survivorId;
      } else {
        const donor = group.find(c => c.id !== survivorId && !isEmpty(c[key]));
        next[key as string] = donor ? donor.id : survivorId;
      }
    }
    setFieldChoices(next);
  }, [survivorId, group]);

  const survivor = useMemo(() => group.find(c => c.id === survivorId) || null, [group, survivorId]);

  const handleMerge = async () => {
    if (!survivor) return;
    setBusy(true);

    // Build the patch: take fieldChoices and emit an UPDATE that brings the
    // survivor's row to the chosen values. We only set columns whose chosen
    // source is NOT the survivor itself — touching every column with its
    // current value is wasted work. Empty winners stay empty (we don't
    // promote empty over empty).
    const patch: Record<string, any> = {};
    for (const { key } of MERGEABLE_FIELDS) {
      const sourceId = fieldChoices[key as string];
      if (!sourceId || sourceId === survivor.id) continue;
      const source = group.find(c => c.id === sourceId);
      if (!source) continue;
      const value = source[key];
      if (isEmpty(value)) continue;
      patch[key as string] = value;
    }

    const losers = group.filter(c => c.id !== survivor.id).map(c => c.id);

    try {
      // 1) Move FK references off the losers onto the survivor so their
      //    history follows the merge. contact_logs / contact_processes /
      //    contact_transfers all FK to contacts.id with ON DELETE CASCADE,
      //    so without this step a hard-delete of the loser would wipe its
      //    history. We're using soft delete here, but keeping all the logs
      //    pointed at the survivor is the right semantic regardless.
      if (losers.length > 0) {
        const { error: logErr } = await supabase
          .from('contact_logs')
          .update({ contact_id: survivor.id })
          .in('contact_id', losers);
        if (logErr) throw logErr;

        const { error: procErr } = await supabase
          .from('contact_processes')
          .update({ contact_id: survivor.id })
          .in('contact_id', losers);
        if (procErr) throw procErr;

        const { error: trErr } = await supabase
          .from('contact_transfers')
          .update({ contact_id: survivor.id })
          .in('contact_id', losers);
        if (trErr) throw trErr;
      }

      // 2) Apply the merged field values to the survivor. Only do the UPDATE
      //    if there's actually something to change.
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', survivor.id);
        if (updErr) throw updErr;
      }

      // 3) Soft-delete the losers (deleted_at + deleted_by). Same pattern
      //    the bulk-delete handler uses; a restore from Papelera would
      //    revive them but their logs would now belong to the survivor —
      //    that's a known acceptable cost of merging.
      if (losers.length > 0) {
        const { error: delErr } = await supabase
          .from('contacts')
          .update({ deleted_at: new Date().toISOString(), deleted_by: userId || null })
          .in('id', losers);
        if (delErr) throw delErr;
      }

      showSuccess(`Merge completado: 1 contacto principal, ${losers.length} eliminado${losers.length === 1 ? '' : 's'}.`);
      onResolved();
      onOpenChange(false);
    } catch (e: any) {
      showError(`Error al mergear: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    // Insert all unique pairs of the group into the dismissals table, with
    // contact_id_a < contact_id_b (the table CHECK enforces that ordering
    // so we don't store the same pair twice in different orders). After
    // this, the duplicate detector hides any pair where BOTH ids appear in
    // a dismissal row, i.e. the user has confirmed they're not duplicates.
    setBusy(true);
    try {
      const ids = group.map(c => c.id).sort();
      const pairs: Array<{ contact_id_a: string; contact_id_b: string; dismissed_by: string | null }> = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          pairs.push({ contact_id_a: ids[i], contact_id_b: ids[j], dismissed_by: userId });
        }
      }
      const { error } = await supabase
        .from('contact_dedupe_dismissals')
        .upsert(pairs, { onConflict: 'contact_id_a,contact_id_b', ignoreDuplicates: true });
      if (error) throw error;
      showSuccess('Marcados como personas distintas. No volverán a aparecer como duplicados.');
      onResolved();
      onOpenChange(false);
    } catch (e: any) {
      showError(`Error al descartar: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  if (group.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" /> Resolver duplicado
          </DialogTitle>
          <DialogDescription>
            Hay {group.length} contactos con el mismo nombre. Elegí cuál es el contacto principal y de cuál tomar cada dato. Después podés mergear (los otros van a Papelera) o marcar que son personas distintas.
          </DialogDescription>
        </DialogHeader>

        {/* Survivor picker. Visually a row of cards, one per contact in the
            group. Click a card to make that contact the survivor. Defaults
            to the oldest one (most history). */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Contacto principal (sobrevive el merge)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {group.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSurvivorId(c.id)}
                className={`text-left p-3 rounded-lg border-2 transition-colors ${
                  c.id === survivorId
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-foreground/30'
                }`}
              >
                <div className="text-sm font-semibold truncate">{c.first_name} {c.last_name || ''}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{c.phone || 'sin teléfono'}</div>
                <div className="text-[11px] text-muted-foreground truncate">{c.address || 'sin dirección'}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">
                  Creado {c.created_at ? new Date(c.created_at).toLocaleDateString('es-AR') : '—'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Per-field merge picker. Shows every mergeable column as a row; in
            each row, every contact gets a radio. The default (set by the
            useEffect on survivor change) fills the survivor's gaps from
            other contacts. The user can override any single field. */}
        <div className="space-y-2 mt-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Datos del contacto resultante
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-muted/40 z-10" style={{ minWidth: 140 }}>
                      Campo
                    </th>
                    {group.map(c => (
                      <th key={c.id} className="px-2 py-2 text-left font-medium" style={{ minWidth: 180 }}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{c.first_name} {c.last_name || ''}</span>
                          {c.id === survivorId && <span className="inline-flex items-center px-1 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-semibold uppercase">Principal</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MERGEABLE_FIELDS.map(({ key, label }) => {
                    // Skip rows where every contact's value is empty — they're
                    // visual noise. Same data either way (NULL stays NULL).
                    const allEmpty = group.every(c => isEmpty(c[key]));
                    if (allEmpty) return null;
                    const conflict = (() => {
                      const vals = group
                        .map(c => c[key])
                        .filter(v => !isEmpty(v))
                        .map(v => String(v));
                      return new Set(vals).size > 1;
                    })();
                    return (
                      <tr key={key as string} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-1.5">
                            <span>{label}</span>
                            {conflict && <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Valores distintos" />}
                          </div>
                        </td>
                        {group.map(c => {
                          const value = c[key];
                          const isPicked = fieldChoices[key as string] === c.id;
                          const empty = isEmpty(value);
                          return (
                            <td key={c.id} className="px-2 py-1.5">
                              <label className={`flex items-start gap-1.5 cursor-pointer ${empty ? 'opacity-50' : ''}`}>
                                <input
                                  type="radio"
                                  name={`field-${key as string}`}
                                  checked={isPicked}
                                  onChange={() => setFieldChoices(prev => ({ ...prev, [key as string]: c.id }))}
                                  className="mt-0.5 shrink-0"
                                />
                                <span className="text-[11px] break-words min-w-0">{fmt(value)}</span>
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={busy}
            className="border-border hover:bg-muted"
            title="Marcar que son personas distintas. Los contactos quedan tal cual y no vuelven a aparecer como duplicados."
          >
            <X className="h-4 w-4 mr-1.5" /> Descartar (son personas distintas)
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleMerge} disabled={busy || !survivor} className="gap-1.5">
              {busy ? 'Mergeando...' : (
                <>
                  <Trash2 className="h-4 w-4" /> Mergear ({group.length - 1} a Papelera)
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateMergeDialog;
