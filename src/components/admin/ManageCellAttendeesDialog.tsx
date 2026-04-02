"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Input } from '@/components/ui/input';

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  cell_id: string | null;
}

interface ManageCellAttendeesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  cellId: string;
}

const ManageCellAttendeesDialog = ({ open, onOpenChange, churchId, cellId }: ManageCellAttendeesDialogProps) => {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, cell_id')
        .eq('church_id', churchId);
      if (error) {
        showError('Error al cargar contactos.');
        return;
      }
      setAllContacts(data || []);
      const preselected = new Set((data || []).filter(c => c.cell_id === cellId).map(c => c.id));
      setSelected(preselected);
    };
    load();
  }, [open, churchId, cellId]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return allContacts;
    return allContacts.filter(c => {
      const s = `${c.first_name} ${c.last_name || ''} ${c.email || ''}`.toLowerCase();
      return s.includes(t);
    });
  }, [allContacts, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // contacts currently in this cell:
    const currentIds = new Set(allContacts.filter(c => c.cell_id === cellId).map(c => c.id));
    const wantIds = selected;

    const toAdd = Array.from(wantIds).filter(id => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter(id => !wantIds.has(id));

    try {
      if (toAdd.length > 0) {
        const { error } = await supabase.from('contacts').update({ cell_id: cellId }).in('id', toAdd);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase.from('contacts').update({ cell_id: null }).in('id', toRemove);
        if (error) throw error;
      }
      showSuccess('Asistentes actualizados.');
      setTimeout(() => onOpenChange(false), 50);
    } catch (e: any) {
      showError(e.message || 'Error al actualizar asistentes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Gestionar Asistentes</DialogTitle>
          <DialogDescription>Selecciona qué contactos asisten a esta célula.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input placeholder="Buscar por nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-[340px] overflow-auto border rounded">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No hay contactos.</div>
            ) : (
              filtered.map(c => (
                <label key={c.id} className="flex items-center gap-3 p-2 border-b last:border-b-0 cursor-pointer">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <div className="flex flex-col">
                    <span className="font-medium">{c.first_name} {c.last_name || ''}</span>
                    <span className="text-xs text-muted-foreground">{c.email || 'Sin email'}</span>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setTimeout(() => onOpenChange(false), 50)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageCellAttendeesDialog;