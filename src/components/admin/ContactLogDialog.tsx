"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
}

const ContactLogDialog: React.FC<ContactLogDialogProps> = ({ open, onOpenChange, churchId, contactId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

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
  }, [open]);

  const handleAdd = async () => {
    if (!date) return;
    setLoading(true);
    try {
      const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/add-contact-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify({ contactId, churchId, contact_date: date, contact_method: method, notes }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showError(err.error || 'Error al agregar el registro.');
      } else {
        showSuccess('Registro agregado.');
        setDate('');
        setMethod('');
        setNotes('');
        loadLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Historial de contacto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Método</Label>
              <Input placeholder="Llamada, WhatsApp, etc." value={method} onChange={(e) => setMethod(e.target.value)} />
            </div>
            <div>
              <Label>Notas</Label>
              <Input placeholder="Detalle" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!date || loading}>Agregar registro</Button>

          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Fecha</TableHead>
                  <TableHead className="w-32">Método</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center">Sin registros</TableCell></TableRow>
                ) : logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>{l.contact_date}</TableCell>
                    <TableCell>{l.contact_method || '-'}</TableCell>
                    <TableCell>{l.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactLogDialog;