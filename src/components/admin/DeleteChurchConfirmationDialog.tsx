"use client";

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface DeleteChurchConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string | null;
  churchName: string | null;
}

const DeleteChurchConfirmationDialog = ({ open, onOpenChange, churchId, churchName }: DeleteChurchConfirmationDialogProps) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!churchId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('churches')
        .delete()
        .eq('id', churchId);

      if (error) {
        console.error('Error deleting church:', error);
        showError(error.message || 'Error al eliminar la iglesia.');
      } else {
        showSuccess(`¡Iglesia "${churchName}" eliminada con éxito!`);
        queryClient.invalidateQueries({ queryKey: ['churches'] });
        onOpenChange(false);
        setConfirmationText('');
      }
    } catch (error: any) {
      console.error('Error during delete church:', error);
      showError(error.message || 'Error desconocido al eliminar la iglesia.');
    } finally {
      setLoading(false);
    }
  };

  const isConfirmButtonDisabled = confirmationText.toLowerCase() !== 'eliminar' || loading;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Esto eliminará permanentemente la iglesia{' '}
            <span className="font-bold text-foreground">"{churchName}"</span> y todos sus datos asociados.
            Por favor, escribe <span className="font-bold text-red-500">ELIMINAR</span> para confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirmation">Escribe "ELIMINAR"</Label>
          <Input
            id="confirmation"
            placeholder="ELIMINAR"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            disabled={loading}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { onOpenChange(false); setConfirmationText(''); }} disabled={loading}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isConfirmButtonDisabled}>
            {loading ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteChurchConfirmationDialog;