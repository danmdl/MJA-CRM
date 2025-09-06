"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const editChurchSchema = z.object({
  name: z.string().min(2, { message: 'El nombre de la iglesia debe tener al menos 2 caracteres.' }),
});

interface Church {
  id: string;
  name: string;
  pastor_id: string | null;
  created_at: string;
}

interface EditChurchNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  church: Church | null;
}

const EditChurchNameDialog = ({ open, onOpenChange, church }: EditChurchNameDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof editChurchSchema>>({
    resolver: zodResolver(editChurchSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (church && open) {
      form.reset({ name: church.name });
    }
  }, [church, open, form]);

  const onSubmit = async (values: z.infer<typeof editChurchSchema>) => {
    if (!church) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('churches')
        .update({ name: values.name })
        .eq('id', church.id);

      if (error) {
        console.error('Error updating church name:', error);
        showError(error.message || 'Error al actualizar el nombre de la iglesia.');
      } else {
        showSuccess(`¡Nombre de la iglesia actualizado a "${values.name}" con éxito!`);
        queryClient.invalidateQueries({ queryKey: ['churches'] });
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Error during update church name:', error);
      showError(error.message || 'Error desconocido al actualizar el nombre de la iglesia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Nombre de Iglesia</DialogTitle>
          <DialogDescription>
            Actualiza el nombre de la iglesia seleccionada.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Iglesia</FormLabel>
                  <FormControl>
                    <Input placeholder="Nuevo Nombre de la Iglesia" {...field} disabled={loading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditChurchNameDialog;