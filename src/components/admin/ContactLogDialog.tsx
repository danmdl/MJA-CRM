"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  // Removed add form state; history-only
  // Removed handleAdd; history-only

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Historial de contacto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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