"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import CountryPhoneInput from '@/components/CountryPhoneInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions'; // Import usePermissions

// Definir el tipo de rol de usuario
type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

const UserRoles = z.enum(['general', 'pastor', 'referente', 'encargado_de_celula', 'user', 'admin']);

const inviteSchema = z.object({
  email: z.string().email({ message: 'Por favor, introduce un correo válido.' }),
  role: UserRoles,
});

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId?: string;
}

const InviteUserDialog = ({ open, onOpenChange, churchId }: InviteUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const queryClient = useQueryClient();
  const { session, profile } = useSession();
  const { canChangeUserRole } = usePermissions(); // Use the new permission

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'user',
    },
  });

  const onSubmit = async (values: z.infer<typeof inviteSchema>) => {
    setLoading(true);
    try {
      if (!session?.access_token) {
        showError('No hay sesión activa. Por favor, inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      console.log('Sending payload to invite-user Edge Function:', {
        ...values,
        churchId,
      });

      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`; // Changed to admin-user-actions
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'inviteUser', // Specify action for admin-user-actions
          email: values.email,
          role: values.role,
          churchId,
          first_name: firstName,
          last_name: lastName,
          phone,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Edge Function response error:', data);
        showError(data.error || 'Error desconocido al invocar la función.');
        setLoading(false);
        return;
      }

      showSuccess('¡Invitación enviada con éxito!');
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (churchId) {
        queryClient.invalidateQueries({ queryKey: ['churchUsers', churchId] });
      }
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error al invitar usuario (client-side catch):', error);
      showError(error.message || 'Error al enviar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  const isAdminOrGeneral = profile?.role === 'admin' || profile?.role === 'general';

  // Roles disponibles para asignar
  const availableRoles: UserRole[] = churchId 
    ? ['pastor', 'referente', 'encargado_de_celula', 'user'] 
    : ['general', 'pastor', 'referente', 'encargado_de_celula', 'user', 'admin'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invitar a un nuevo miembro</DialogTitle>
          <DialogDescription>
            Introduce el correo electrónico y asigna un rol. El usuario recibirá una invitación para unirse.
            {churchId && <p className="text-sm text-muted-foreground mt-1">Se asignará a la iglesia actual.</p>}
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
                    <Input placeholder="nombre@ejemplo.com" {...field} disabled={!canChangeUserRole()} /> {/* Disabled if no permission */}
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
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!canChangeUserRole()}> {/* Disabled if no permission */}
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((roleOption) => (
                        <SelectItem 
                          key={roleOption} 
                          value={roleOption}
                          disabled={!isAdminOrGeneral && (roleOption === 'admin' || roleOption === 'general')}
                        >
                          {roleOption === 'referente' 
                            ? 'Referente' 
                            : roleOption.charAt(0).toUpperCase() + roleOption.slice(1).replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-sm">Nombre</label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!canChangeUserRole()} /></div> {/* Disabled if no permission */}
              <div><label className="text-sm">Apellido</label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!canChangeUserRole()} /></div> {/* Disabled if no permission */}
            </div>
            <CountryPhoneInput label="Teléfono" value={phone} onChange={setPhone} disabled={!canChangeUserRole()} /> {/* Disabled if no permission */}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !canChangeUserRole()}> {/* Disabled if no permission */}
                {loading ? 'Enviando...' : 'Enviar Invitación'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;