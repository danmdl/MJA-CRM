"use client";
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { ROLE_LABELS, RoleKey } from '@/lib/roles';
import { usePermissions } from '@/lib/permissions';

interface Church {
  id: string;
  name: string;
}

const createUserSchema = z.object({
  email: z.string().email({ message: 'Por favor, introduce un correo válido.' }),
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  first_name: z.string().min(1, { message: 'El nombre es obligatorio.' }),
  last_name: z.string().min(1, { message: 'El apellido es obligatorio.' }),
  role: z.enum(['general', 'pastor', 'referente', 'encargado_de_celula', 'user'], {
    errorMap: () => ({ message: 'El rol es obligatorio.' })
  }),
  church_id: z.string().uuid({ message: 'La iglesia es obligatoria.' }).or(z.literal('')),
});

interface CreateUserDialogProps {
  open: boolean; // Added missing open prop
  onOpenChange: (open: boolean) => void;
}

// Función para obtener las iglesias
const fetchChurches = async (): Promise<Church[]> => {
  const { data, error } = await supabase
    .from('churches')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) {
    console.error('Error fetching churches:', error);
    throw new Error('No se pudieron cargar las iglesias.');
  }
  return data || [];
};

const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => { // Added open prop
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { session, profile } = useSession();
  const { canChangeUserRole } = usePermissions();
  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      role: undefined,
      church_id: '',
    },
  });

  // Cargar iglesias para el selector
  const { data: churches, isLoading: isLoadingChurches, isError: isErrorChurches, error: errorChurches } = useQuery<Church[]>({
    queryKey: ['churches'],
    queryFn: fetchChurches,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  useEffect(() => {
    if (isErrorChurches) {
      showError(errorChurches?.message || 'Error al cargar la lista de iglesias.');
    }
  }, [isErrorChurches, errorChurches]);

  const onSubmit = async (values: z.infer<typeof createUserSchema>) => {
    setLoading(true);
    try {
      if (!session?.access_token) {
        showError('No hay sesión activa. Por favor, inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/admin-user-actions`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'createUser',
          email: values.email,
          password: values.password,
          first_name: values.first_name,
          last_name: values.last_name,
          role: values.role,
          churchId: values.church_id === '' ? null : values.church_id,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Edge Function response error:', data);
        const errorMessage = data.error || 'Error desconocido al invocar la función.';
        if (errorMessage.includes('Forbidden')) {
          showError('No tienes permiso. No tienes los permisos necesarios. Contacta a tu administrador.');
        } else {
          showError(errorMessage);
        }
        setLoading(false);
        return;
      }

      showSuccess('¡Usuario creado con éxito!');
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['churchUsers'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error al crear usuario (client-side catch):', error);
      showError(error.message || 'Error al crear el usuario.');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';

  // Roles permitidos para la creación de usuarios
  const allowedRolesForCreation: z.infer<typeof createUserSchema>['role'][] = createUserSchema.shape.role.options;

  // Filtrar roles disponibles para el selector en la UI
  const availableRoles = allowedRolesForCreation.filter(roleOption => {
    if (!isAdmin && roleOption === 'general') {
      return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}> {/* Added open prop */}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Introduce los detalles para crear una nueva cuenta de usuario. Todos los campos son obligatorios.
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
                    <Input placeholder="nombre@ejemplo.com" {...field} disabled={loading || !canChangeUserRole()} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} disabled={loading || !canChangeUserRole()} />
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
                    <Input placeholder="Primer Nombre" {...field} disabled={loading || !canChangeUserRole()} />
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
                    <Input placeholder="Apellido" {...field} disabled={loading || !canChangeUserRole()} />
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
                  <Select onValueChange={field.onChange} value={field.value || "placeholder-role-select"} disabled={loading || !canChangeUserRole()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="placeholder-role-select" disabled>Selecciona un rol</SelectItem>
                      {availableRoles.map((roleOption) => (
                        <SelectItem key={roleOption} value={roleOption}>
                          {ROLE_LABELS[roleOption as RoleKey] || roleOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="church_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Iglesia Asignada</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "placeholder-church-select"} disabled={loading || isLoadingChurches || !canChangeUserRole()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingChurches ? "Cargando iglesias..." : "Selecciona una iglesia"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="placeholder-church-select" disabled>Selecciona una iglesia</SelectItem>
                      <SelectItem value="">Sin iglesia asignada</SelectItem>
                      {churches?.map((church) => (
                        <SelectItem key={church.id} value={church.id}>
                          {church.name}
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
              <Button type="submit" disabled={loading || isLoadingChurches || !canChangeUserRole()}>
                {loading ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;