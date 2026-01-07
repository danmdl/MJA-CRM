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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';

const addContactSchema = z.object({
  first_name: z.string().min(1, { message: 'El nombre es obligatorio.' }),
  last_name: z.string().optional(),
  email: z.string().email({ message: 'Introduce un correo válido.' }).optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  apartment_number: z.string().optional(),
  barrio: z.string().optional(),
  leader_assigned: z.string().optional(),
  cell_id: z.string().optional(),
});

interface Cell {
  id: string;
  name: string;
}

interface Leader {
  id: string;
  first_name: string;
  last_name: string;
}

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
}

const AddContactDialog = ({ open, onOpenChange, churchId }: AddContactDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  logger.log('AddContactDialog rendered', { open, churchId });

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
      cell_id: '',
    },
  });

  // Fetch cells for the current church
  const { data: cells, isLoading: isLoadingCells, isError: isCellsError, error: cellsError } = useQuery<Cell[]>({
    queryKey: ['cells', churchId],
    queryFn: async () => {
      logger.log('Fetching cells for church', { churchId });
      const { data, error } = await supabase
        .from('cells')
        .select('id, name')
        .eq('church_id', churchId)
        .order('name', { ascending: true });

      if (error) {
        logger.error('Error fetching cells', error);
        throw new Error('No se pudieron cargar las células.');
      }
      
      logger.log('Cells fetched successfully', data);
      return data || [];
    },
    enabled: !!churchId,
  });

  // Log any errors in fetching cells
  useEffect(() => {
    if (isCellsError) {
      logger.error('Error in cells query', cellsError);
    }
  }, [isCellsError, cellsError]);

  // Fetch leaders for the current church
  const { data: leaders, isLoading: isLoadingLeaders, isError: isLeadersError, error: leadersError } = useQuery<Leader[]>({
    queryKey: ['leaders', churchId],
    queryFn: async () => {
      logger.log('Fetching leaders for church', { churchId });
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('church_id', churchId)
        .in('role', ['pastor', 'piloto', 'encargado_de_celula'])
        .order('first_name', { ascending: true });

      if (error) {
        logger.error('Error fetching leaders', error);
        throw new Error('No se pudieron cargar los líderes.');
      }
      
      logger.log('Leaders fetched successfully', data);
      return data || [];
    },
    enabled: !!churchId,
  });

  // Log any errors in fetching leaders
  useEffect(() => {
    if (isLeadersError) {
      logger.error('Error in leaders query', leadersError);
    }
  }, [isLeadersError, leadersError]);

  const onSubmit = async (values: z.infer<typeof addContactSchema>) => {
    logger.log('Submitting contact form', values);
    setLoading(true);
    
    try {
      const contactData = {
        ...values,
        church_id: churchId,
        email: values.email || null,
        cell_id: values.cell_id || null,
        leader_assigned: values.leader_assigned || null,
      };
      
      logger.log('Inserting contact data', contactData);
      
      const { data, error } = await supabase
        .from('contacts')
        .insert(contactData)
        .select();

      if (error) {
        logger.error('Error adding contact', error);
        showError(error.message || 'Error al añadir el contacto.');
      } else {
        logger.log('Contact added successfully', data);
        showSuccess(`¡Contacto "${values.first_name}" añadido con éxito!`);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['contacts', churchId] });
        onOpenChange(false);
      }
    } catch (error: any) {
      logger.error('Error during add contact', error);
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
                        type={field.type === 'email' ? 'email' : 'text'}
                        placeholder={field.label}
                        {...formField}
                        value={formField.value || ''}
                        disabled={loading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            {/* Cell selector */}
            <FormField
              control={form.control}
              name="cell_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Célula</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                    disabled={loading || isLoadingCells}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCells ? "Cargando células..." : "Selecciona una célula (opcional)"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Sin célula asignada</SelectItem>
                      {cells?.map((cell) => (
                        <SelectItem key={cell.id} value={cell.id}>
                          {cell.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Leader selector */}
            <FormField
              control={form.control}
              name="leader_assigned"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Líder Asignado</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                    disabled={loading || isLoadingLeaders}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingLeaders ? "Cargando líderes..." : "Selecciona un líder (opcional)"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Sin líder asignado</SelectItem>
                      {leaders?.map((leader) => (
                        <SelectItem key={leader.id} value={leader.id}>
                          {leader.first_name} {leader.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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