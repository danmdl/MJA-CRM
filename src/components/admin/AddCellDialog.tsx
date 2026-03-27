"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';

type Leader = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

interface AddCellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  initial?: {
    id: string;
    name: string;
    encargado_id: string | null;
    address: string | null;
    meeting_day: string | null;
    meeting_time: string | null;
  } | null;
}

const AddCellDialog = ({ open, onOpenChange, churchId, initial }: AddCellDialogProps) => {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [encargado, setEncargado] = useState<string | null>(initial?.encargado_id || null);
  const [address, setAddress] = useState(initial?.address || '');
  const [meetingDay, setMeetingDay] = useState(initial?.meeting_day || '');
  const [meetingTime, setMeetingTime] = useState(initial?.meeting_time || '');
  const [saving, setSaving] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setEncargado(initial?.encargado_id || null);
      setAddress(initial?.address || '');
      setMeetingDay(initial?.meeting_day || '');
      setMeetingTime(initial?.meeting_time || '');
    }
  }, [open, initial]);

  // Leaders from edge function (matches Equipo)
  const { data: leaders } = useQuery<Leader[]>({
    queryKey: ['cell-leaders', churchId, !!session?.access_token],
    queryFn: async () => {
      const resp = await fetch(`https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ action: 'listChurchUsers', churchId }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const leaderRoles = ['pastor', 'referente', 'encargado_de_celula', 'general'];
      return (data || [])
        .filter((u: any) => leaderRoles.includes(u.role))
        .map((u: any) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
        })) as Leader[];
    },
    enabled: !!churchId && !!session?.access_token,
    staleTime: 60_000,
  });

  const handleSave = async () => {
    if (!name.trim()) {
      showError('El nombre es obligatorio.');
      return;
    }

    setSaving(true);
    if (isEdit && initial) {
      const { error } = await supabase
        .from('cells')
        .update({
          name: name.trim(),
          encargado_id: encargado,
          address: address || null,
          meeting_day: meetingDay || null,
          meeting_time: meetingTime || null,
        })
        .eq('id', initial.id)
        .eq('church_id', churchId);

      if (error) {
        showError(error.message || 'Error al actualizar la célula.');
      } else {
        showSuccess('Célula actualizada con éxito.');
        onOpenChange(false);
      }
    } else {
      const { error } = await supabase
        .from('cells')
        .insert({
          name: name.trim(),
          church_id: churchId,
          encargado_id: encargado,
          address: address || null,
          meeting_day: meetingDay || null,
          meeting_time: meetingTime || null,
        });

      if (error) {
        showError(error.message || 'Error al crear la célula.');
      } else {
        showSuccess('Célula creada con éxito.');
        onOpenChange(false);
      }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Célula' : 'Crear Célula'}</DialogTitle>
          <DialogDescription>
            Define el nombre, referente y el horario/dirección de la célula.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la célula"
            />
          </div>
          <div className="space-y-2">
            <Label>Referente asignado</Label>
            <Select value={encargado || undefined} onValueChange={(v) => setEncargado(v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona un referente (opcional)" /></SelectTrigger>
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
          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, número, barrio..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Día</Label>
              <Input
                value={meetingDay}
                onChange={(e) => setMeetingDay(e.target.value)}
                placeholder="Ej: Miércoles"
              />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                placeholder="Ej: 19:30"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCellDialog;