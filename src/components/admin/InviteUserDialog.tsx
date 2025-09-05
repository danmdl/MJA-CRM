import { useState } from 'react';
import { useForm } from 'react-hook-form'; // Corregido: useForm se importa de react-hook-form
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

// Definir los nuevos roles como un enum de Zod
const UserRoles = z.enum(['general', 'pastor', 'piloto', 'encargado_de_celula', 'user']);

const inviteSchema = z.object({
  email: z.string().email({ message: 'Por favor, introduce un correo válido.' }),
  role: UserRoles, // Usar el nuevo enum de roles
});

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InviteUserDialog = ({ open, onOpenChange }: InviteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'user', // Rol por defecto
    },
  });

  const onSubmit = async (values: z.infer<typeof inviteSchema>) => {
    setLoading(true);
    try {
      console.log('Sending payload to invite-user Edge Function:', values); // Nuevo log aquí

      // Invocar la Edge Function para enviar la invitación
      const { data, error: invokeError } = await supabase.functions.invoke('invite-user', {
        body: JSON.stringify(values),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (invokeError) {
        console.error('Supabase Edge Function invocation error:', invokeError);
        let errorMessage = invokeError.message || 'Error desconocido al invocar la función.';
        try {
          const parsedError = JSON.parse(invokeError.message);
          if (parsedError.error) {
            errorMessage = parsedError.error;
          }
        } catch (e) {
          // No es un JSON string, usar el mensaje tal cual
        }
        showError(errorMessage);
        setLoading(false);
        return;
      }

      showSuccess('¡Invitación enviada con éxito!');
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error al invitar usuario (client-side catch):', error);
      showError(error.message || 'Error al enviar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invitar a un nuevo miembro</DialogTitle>
          <DialogDescription>
            Introduce el correo electrónico y asigna un rol. El usuario recibirá una invitación para unirse.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo Electrónico</FormLabel>
                  <FormControl>
                    <Input placeholder="nombre@ejemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="pastor">Pastor</SelectItem>
                      <SelectItem value="piloto">Piloto</SelectItem>
                      <SelectItem value="encargado_de_celula">Encargado de Célula</SelectItem>
                      <SelectItem value="user">Usuario</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar Invitación'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};