"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
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

const addChurchSchema = z.object({
  name: z.string().min(2, { message: 'El nombre de la iglesia debe tener al menos 2 caracteres.' }),
  // pastor_id is optional for now, can be added later
});

interface AddChurchDialogProps {
  onOpenChange: (open: boolean) => void;
}

const AddChurchDialog = ({ onOpenChange }: AddChurchDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof addChurchSchema>>({
    resolver: zodResolver(addChurchSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof addChurchSchema>) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('churches')
        .insert({ name: values.name })
        .select();

      if (error) {
        console.error('Error adding church:', error);
        showError(error.message || 'Error al añadir la iglesia.');
      } else {
        showSuccess(`¡Iglesia "${values.name}" añadida con éxito!`);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['churches'] }); // Refresh the list of churches
        onOpenChange(false); // Close the dialog
      }
    } catch (error: any) {
      console.error('Error during add church:', error);
      showError(error.message || 'Error desconocido al añadir la iglesia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la Iglesia</FormLabel>
              <FormControl>
                <Input placeholder="Nombre de la Iglesia" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* You can add a field for pastor_id here if needed, e.g., a Select with existing users */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Añadiendo...' : 'Añadir Iglesia'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default AddChurchDialog;