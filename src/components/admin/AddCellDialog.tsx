"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { MapPin, Loader2 } from 'lucide-react';

type Leader = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Debounced address autocomplete using Nominatim (OpenStreetMap)
const AddressAutocomplete = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 4) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)},Argentina&format=json&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'es', 'User-Agent': 'MJA-CRM/1.0' } }
        );
        const data: GeoResult[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 400);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value); // keep parent in sync while typing (no coords yet)
    search(e.target.value);
  };

  const handleSelect = (result: GeoResult) => {
    setQuery(result.display_name);
    // Pass coordinates along with address when user picks a suggestion
    onChange(result.display_name, parseFloat(result.lat), parseFloat(result.lon));
    setSuggestions([]);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Escribe la calle y número para buscar..."
          className="pr-8"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        </div>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
              onClick={() => handleSelect(s)}
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span className="line-clamp-2">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [meetingDay, setMeetingDay] = useState(initial?.meeting_day || '');
  const [meetingTime, setMeetingTime] = useState(initial?.meeting_time || '');
  const [saving, setSaving] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setEncargado(initial?.encargado_id || null);
      setAddress(initial?.address || '');
      setLat(null);
      setLng(null);
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
          lat: lat ?? undefined,
          lng: lng ?? undefined,
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
          lat: lat ?? null,
          lng: lng ?? null,
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
            <AddressAutocomplete
              value={address}
              onChange={(addr, alat, alng) => {
                setAddress(addr);
                if (alat !== undefined) setLat(alat);
                if (alng !== undefined) setLng(alng);
              }}
            />
            <p className="text-xs text-muted-foreground">Escribe la calle y número y selecciona una sugerencia para ubicación exacta en el mapa.</p>
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