"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ContactLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  contactId: string;
  refreshSignal?: number;
}

const ContactLogDialog: React.FC<ContactLogDialogProps> = ({ open, onOpenChange, churchId, contactId, refreshSignal }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editMethod, setEditMethod] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const MAX_NOTES = 280;

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from('contact_logs')
      .select('*')
      .eq('contact_id', contactId)
      .order('contact_date', { ascending: false });
    if (error) {
      showError('Error al cargar el historial de contacto.');
    } else {
      setLogs(data || []);
    }
  };

  useEffect(() => {
    if (open) loadLogs();
  }, [open, refreshSignal]);

  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`contact_logs_${contactId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_logs', filter: `contact_id=eq.${contactId}` },
        () => {
          loadLogs();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  const within24h = (row: any) => {
    const ts = row?.created_at || row?.contact_date;
    if (!ts) return false;
    try {
      const diff = Date.now() - new Date(ts).getTime();
      return diff < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  const handleDelete = async (row: any) => {
    if (!row) return;
    if (!within24h(row)) {
      showError('No puedes eliminar este registro (más de 24 horas).');
      return;
    }
    if (!window.confirm('¿Eliminar este registro?')) return;
    const { error } = await supabase.from('contact_logs').delete().eq('id', row.id);
    if (error) {
      showError(error.message || 'Error al eliminar registro.');
    } else {
      showSuccess('Registro eliminado.');
      loadLogs();
    }
  };

  const openEdit = (row: any) => {
    setEditingLog(row);
    setEditDate(row.contact_date ? row.contact_date.split('T')[0] : '');
    setEditMethod(row.contact_method || '');
    setEditNotes(row.notes || '');
  };

  const closeEdit = () => {
    setEditingLog(null);
    setEditDate('');
    setEditMethod('');
    setEditNotes('');
    setEditLoading(false);
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    if (!within24h(editingLog)) {
      showError('No puedes editar este registro (más de 24 horas).');
      return;
    }
    setEditLoading(true);
    const { error } = await supabase
      .from('contact_logs')
      .update({
        contact_date: editDate,
        contact_method: editMethod,
        notes: editNotes,
      })
      .eq('id', editingLog.id);
    if (error) {
      showError(error.message || 'Error al actualizar registro.');
    } else {
      showSuccess('Registro actualizado.');
      closeEdit();
      loadLogs();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Historial de contacto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-x-auto border rounded-md">
            {/* Use a fixed table layout so columns respect width constraints and actions stay visible */}
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Fecha</TableHead>
                  <TableHead className="w-32">Método</TableHead>
                  <TableHead className="w-full max-w-[36ch]">Notas</TableHead>
                  <TableHead className="w-36 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Sin registros</TableCell>
                  </TableRow>
                ) : logs.map(l => {
                  const editable = within24h(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="align-top">
                        {l.contact_date ? new Date(l.contact_date).toISOString().split('T')[0] : '-'}
                      </TableCell>
                      <TableCell className="align-top">{l.contact_method || '-'}</TableCell>
                      {/* Constrain notes width and allow wrapping so the actions column stays visible */}
                      <TableCell
                        className="align-top break-words whitespace-normal max-w-[36ch] px-2"
                        title={l.notes || ''}
                      >
                        {l.notes || '-'}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <div className="flex items-center justify-end gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(l)}
                            disabled={!editable}
                            title={editable ? 'Editar registro' : 'No puedes editar (más de 24 horas)'}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(l)}
                            disabled={!editable}
                            title={editable ? 'Eliminar registro' : 'No puedes eliminar (más de 24 horas)'}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
      {/* Edit Dialog */}
      <Dialog open={!!editingLog} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar registro</DialogTitle>
            <DialogDescription>Los registros sólo se pueden editar dentro de las primeras 24 horas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label>Método</Label>
              <Input placeholder="Llamada, WhatsApp, etc." value={editMethod} onChange={(e) => setEditMethod(e.target.value)} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={4}
                placeholder="Detalle"
                value={editNotes}
                maxLength={MAX_NOTES}
                onChange={(e) => setEditNotes(e.target.value)}
              />
              <div className="text-sm text-muted-foreground text-right">{editNotes.length}/{MAX_NOTES}</div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeEdit} disabled={editLoading}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={editLoading}>{editLoading ? 'Guardando...' : 'Guardar'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default ContactLogDialog;