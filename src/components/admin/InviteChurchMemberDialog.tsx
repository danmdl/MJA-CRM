"use client";

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useSession } from '@/hooks/use-session';
import { showError, showSuccess } from '@/utils/toast';
import { PlusCircle } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula';

const inviteSchema = z.object({
  email: z.string().email({ message: 'Correo inválido.' }),
  first_name: z.string().min(1, { message: 'Nombre requerido.' }),
  last_name: z.string().min(1, { message: 'Apellido requerido.' }),
  role: z.enum(['pastor', 'referente', 'encargado_de_celula', 'general', 'admin']),
});

const InviteChurchMemberDialog = ({ churchId }: { churchId: string }) => {
  const { session } = useSession();
  const { canAddUsers } = usePermissions();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      role: 'referente',
    },
  });

  const edgeUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;

  const inviteMutation = useMutation({
    mutationFn: async (values: z.infer<typeof inviteSchema>) => {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'inviteUserToChurch', email: values.email, first_name: values.first_name, last_name: values.last_name, role: values.role, churchId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al invitar el usuario.');
      }
      return res.json();
    },
    onSuccess: () => {
      showSuccess('Invitación enviada correctamente.');
      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['churchTeam', churchId] });
    },
    onError: (e: any) => {
      const msg = e?.message || 'Error desconocido.';
      showError(msg);
    },
  });

  const onSubmit = (values: z.infer<typeof inviteSchema>) => {
    inviteMutation.mutate(values);
  };

  // Reglas dinámicas de roles visibles en invitación
  const getInviteRoles = (): UserRole[] => {
    const roles: UserRole[] = ['pastor', 'referente', 'encargado_de_celula'];

    // Solo admin puede invitar como 'general' o 'admin'
    if (session?.user?.email === 'dan.delauretis@gmail.com') {
      roles.push('general', 'admin');
    } else if (session?.profile?.role === 'admin') {
      roles.push('general');
    }

    return roles;
  };

  const visibleInviteRoles = getInviteRoles();

  const formatRoleLabel = (role: UserRole) => {
    if (role === 'referente') return 'Referente';
    if (role === 'encargado_de_celula') return 'Encargado de Célula';
    return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canAddUsers()} type="button">
          <PlusCircle className="mr-2 h-4 w-4" />
          Invitar miembro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar miembro a la iglesia</DialogTitle>
          <DialogDescription>Envía una invitación para que el usuario complete su registro y sea asignado a esta iglesia.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo</FormLabel>
                  <FormControl>
                    <Input placeholder="Correo electrónico" {...field} type="email" disabled={inviteMutation.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre" {...field} disabled={inviteMutation.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido</FormLabel>
                  <FormControl>
                    <Input placeholder="Apellido" {...field} disabled={inviteMutation.isPending} />
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
                  <FormLabel>Rol inicial</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleInviteRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {formatRoleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Enviando...' : 'Invitar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteChurchMemberDialog;