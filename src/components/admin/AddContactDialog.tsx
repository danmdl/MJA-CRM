"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { CONTACT_FIELDS } from '@/lib/contact-fields';

const addContactSchema = z.object({
  first_name: z.string().min(1, { message: 'El nombre es obligatorio.' }),
  last_name: z.string().optional(),
  email: z.string().email({ message: 'Introduce un correo válido.' }).optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  apartment_number: z.string().optional(),
  barrio: z.string().optional(),
  leader_assigned: z.string().optional(),
});

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
}

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof addContactSchema>>({
    resolver: zodResolver(addContactSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      apartment_number: '',
      barrio: '',
      leader_assigned: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof addContactSchema>) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          ...values,
          church_id: churchId,
          email: values.email || null, // Ensure empty string becomes null for DB
        })
        .select();

      if (error) {
        console.error('Error adding contact:', error);
        showError(error.message || 'Error al añadir el contacto.');
      } else {
        showSuccess(`¡Contacto "${values.first_name}" añadido con éxito!`);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] }); // Refresh the list of contacts for this church
        onOpenChange(false); // Close the dialog
      }
    } catch (error: any) {
      console.error('Error during add contact:', error);
      showError(error.message || 'Error desconocido al añadir el contacto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Contacto</DialogTitle>
          <DialogDescription>
            Introduce los detalles del nuevo contacto para esta iglesia.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {CONTACT_FIELDS.filter(field => field.key !== 'created_at').map(field => (
              <FormField
                key={field.key}
                control={form.control}
                name={field.key as keyof z.infer<typeof addContactSchema>}
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>{field.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={field.type}
                        placeholder={field.label}
                        {...formField}
                        value={formField.value || ''} // Ensure controlled component
                        disabled={loading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creando...' : 'Crear Contacto'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddContactDialog;