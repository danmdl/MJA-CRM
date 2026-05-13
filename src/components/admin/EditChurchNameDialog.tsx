"use client";

import { useState, useEffect } from 'react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeSlug } from '@/lib/church-slug';

const editChurchSchema = z.object({
  name: z.string().min(2, { message: 'El nombre de la iglesia debe tener al menos 2 caracteres.' }),
  slug: z
    .string()
    .min(2, { message: 'El identificador debe tener al menos 2 caracteres.' })
    .max(20, { message: 'El identificador no puede tener más de 20 caracteres.' })
    .regex(/^[A-Z0-9]+$/, { message: 'Solo letras mayúsculas (A-Z) y números (0-9). Sin espacios ni acentos.' }),
});

interface Church {
  id: string;
  name: string;
  slug?: string | null;
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
      slug: '',
    },
  });

  useEffect(() => {
    if (church && open) {
      form.reset({ name: church.name, slug: church.slug ?? normalizeSlug(church.name) });
    }
  }, [church, open, form]);

  const onSubmit = async (values: z.infer<typeof editChurchSchema>) => {
    if (!church) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('churches')
        .update({ name: values.name, slug: values.slug })
        .eq('id', church.id);

      if (error) {
        console.error('Error updating church:', error);
        // Surface unique constraint hits with a friendly message — the
        // 23505 code means the slug is already taken by another church.
        if ((error as any).code === '23505') {
          showError(`El identificador "${values.slug}" ya está en uso por otra iglesia.`);
        } else {
          showError(error.message || 'Error al actualizar la iglesia.');
        }
      } else {
        showSuccess(`¡Iglesia "${values.name}" actualizada con éxito!`);
        queryClient.invalidateQueries({ queryKey: ['churches'] });
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Error during update church:', error);
      showError(error.message || 'Error desconocido al actualizar la iglesia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Iglesia</DialogTitle>
          <DialogDescription>
            Actualiza el nombre y el identificador de URL de la iglesia.
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
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Identificador URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="MJACENTRAL"
                      {...field}
                      disabled={loading}
                      onChange={(e) => field.onChange(normalizeSlug(e.target.value))}
                      maxLength={20}
                    />
                  </FormControl>
                  <FormDescription>
                    Aparece en la URL: /admin/churches/<strong>{field.value || 'IDENTIFICADOR'}</strong>/...
                    {' '}Único, mayúsculas, sin espacios ni acentos, máx. 20 caracteres.
                  </FormDescription>
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
