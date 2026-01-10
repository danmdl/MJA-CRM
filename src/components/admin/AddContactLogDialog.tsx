"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

interface AddContactLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  contactId: string;
  onAdded?: () => void; // callback to refresh/open history
}

const AddContactLogDialog: React.FC<AddContactLogDialogProps> = ({ open, onOpenChange, churchId, contactId, onAdded }) => {
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const MAX_NOTES = 280;

  const handleAdd = async () => {
    if (!date) return;
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch('https://jczsgvaednptnypxhcje.supabase.co/functions/v1/add-contact-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
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
        onOpenChange(false);
        if (onAdded) onAdded();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Agregar registro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Método</Label>
              <Input placeholder="Llamada, WhatsApp, etc." value={method} onChange={(e) => setMethod(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={4} placeholder="Detalle" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES} />
            <div className="text-sm text-muted-foreground text-right">{notes.length}/{MAX_NOTES}</div>
          </div>
          <Button onClick={handleAdd} disabled={!date || loading}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddContactLogDialog;