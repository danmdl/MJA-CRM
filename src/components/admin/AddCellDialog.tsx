"use client";
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import AddressAutocomplete from './AddressAutocomplete';

type Leader = { id: string; first_name: string | null; last_name: string | null; email?: string | null; };
interface Cuerda { id: string; numero: string; zona_id: string; }
interface Zona { id: string; nombre: string; }

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TIMES = (() => {
  const t: string[] = [];
  for (let h = 6; h <= 22; h++) { t.push(`${h.toString().padStart(2,'0')}:00`); t.push(`${h.toString().padStart(2,'0')}:30`); }
  return t;
})();

interface AddCellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  initial?: {
    id: string; name: string; encargado_id: string | null; cuerda_id?: string | null;
    address: string | null; meeting_day: string | null; meeting_time: string | null;
  } | null;
}

const AddCellDialog = ({ open, onOpenChange, churchId, initial }: AddCellDialogProps) => {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [cuerdaId, setCuerdaId] = useState<string | null>(initial?.cuerda_id || null);
  const [encargado, setEncargado] = useState<string | null>(initial?.encargado_id || null);
  const [address, setAddress] = useState(initial?.address || '');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [meetingDay, setMeetingDay] = useState(initial?.meeting_day || '');
  const [meetingTime, setMeetingTime] = useState(initial?.meeting_time || '');
  const [saving, setSaving] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setCuerdaId(initial?.cuerda_id || null);
      setEncargado(initial?.encargado_id || null);
      setAddress(initial?.address || '');
      setLat(null); setLng(null);
      setMeetingDay(initial?.meeting_day || '');
      setMeetingTime(initial?.meeting_time || '');
    }
  }, [open, initial]);

  const { data: zonas } = useQuery<Zona[]>({
    queryKey: ['zonas', churchId],
    queryFn: async () => { const { data } = await supabase.from('zonas').select('id, nombre').eq('church_id', churchId).order('nombre'); return data || []; },
    enabled: !!churchId && open,
  });

  const { data: cuerdas } = useQuery<Cuerda[]>({
    queryKey: ['cuerdas-dialog', churchId],
    queryFn: async () => {
      if (!zonas?.length) return [];
      const { data } = await supabase.from('cuerdas').select('id, numero, zona_id').in('zona_id', zonas.map(z => z.id)).order('numero');
      return data || [];
    },
    enabled: !!zonas?.length && open,
  });

  const cuerdaOptions = (zonas || []).map(zona => ({
    zona, cuerdas: (cuerdas || []).filter(c => c.zona_id === zona.id),
  })).filter(g => g.cuerdas.length > 0);

  const { data: leaders } = useQuery<Leader[]>({
    queryKey: ['cell-leaders', churchId, !!session?.access_token],
    queryFn: async () => {
      const resp = await fetch(`https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ action: 'listChurchUsers', churchId }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data || []).map((u: any) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, email: u.email })) as Leader[];
    },
    enabled: !!churchId && !!session?.access_token && open,
    staleTime: 60_000,
  });

  // Name is auto-generated at save time from cuerda number

  const handleSave = async () => {
    if (!cuerdaId) { showError('Seleccioná una cuerda.'); return; }

    // Auto-generate name from cuerda number
    const cuerda = cuerdas?.find(c => c.id === cuerdaId);
    const autoName = name.trim() || (cuerda ? `Célula Cuerda ${cuerda.numero}` : 'Célula');

    setSaving(true);
    const payload = {
      name: autoName, cuerda_id: cuerdaId, encargado_id: encargado,
      address: address.trim(), lat: lat ?? null, lng: lng ?? null,
      meeting_day: meetingDay || null, meeting_time: meetingTime || null,
    };

    if (isEdit && initial) {
      const { error } = await supabase.from('cells').update(payload).eq('id', initial.id).eq('church_id', churchId);
      if (error) showError(error.message); else { showSuccess('Célula actualizada.'); setTimeout(() => onOpenChange(false), 50); }
    } else {
      const { error } = await supabase.from('cells').insert({ ...payload, church_id: churchId });
      if (error) showError(error.message); else { showSuccess('Célula creada.'); setTimeout(() => onOpenChange(false), 50); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Célula' : 'Crear Célula'}</DialogTitle>
          <DialogDescription>Asigná la célula a una cuerda, definí el líder y el horario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Cuerda (mandatory) */}
          <div className="space-y-2">
            <Label>Cuerda <span className="text-red-500">*</span></Label>
            <Select value={cuerdaId || undefined} onValueChange={setCuerdaId}>
              <SelectTrigger><SelectValue placeholder="Seleccioná una cuerda" /></SelectTrigger>
              <SelectContent>
                {cuerdaOptions.map(({ zona, cuerdas: zc }) => (
                  <React.Fragment key={zona.id}>
                    <SelectItem value={`__label_${zona.id}`} disabled className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {zona.nombre}
                    </SelectItem>
                    {zc.map(c => (
                      <SelectItem key={c.id} value={c.id}>#{c.numero} — {zona.nombre}</SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dirección (mandatory) */}
          <div className="space-y-2">
            <Label>Dirección</Label>
            <AddressAutocomplete
              value={address}
              onChange={(addr, alat, alng) => { setAddress(addr); if (alat !== undefined) setLat(alat); if (alng !== undefined) setLng(alng); }}
            />
          </div>

          {/* Líder de Célula */}
          <div className="space-y-2">
            <Label>Líder de Célula</Label>
            <Select value={encargado || undefined} onValueChange={v => setEncargado(v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccioná un líder (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignación</SelectItem>
                {(leaders || []).map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email || 'Sin nombre'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Día y Hora dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Día</Label>
              <Select value={meetingDay || undefined} onValueChange={setMeetingDay}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Select value={meetingTime || undefined} onValueChange={setMeetingTime}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setTimeout(() => onOpenChange(false), 50)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCellDialog;
