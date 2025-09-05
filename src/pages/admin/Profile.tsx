import { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { UpdatePasswordForm } from '@/components/admin/UpdatePasswordForm'; // Importar el nuevo componente

const profileSchema = z.object({
  first_name: z.string().min(1, { message: 'El nombre es requerido.' }),
  last_name: z.string().optional(),
  email: z.string().email({ message: 'Correo electrónico inválido.' }).optional(), // Email no editable directamente aquí
});

const Profile = () => {
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          showError('Error al cargar el perfil.');
        } else if (data) {
          setUserProfile(data);
          form.reset({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            email: user.email || '', // Usar el email del auth.user
          });
        }
      }
      setLoading(false);
    };

    fetchProfile();
  }, [form]);

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        showError(error.message || 'Error al actualizar el perfil.');
      } else {
        showSuccess('¡Perfil actualizado con éxito!');
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Mi Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Tu nombre" {...field} />
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
                      <Input placeholder="Tu apellido" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico</FormLabel>
                    <FormControl>
                      <Input placeholder="Tu correo electrónico" {...field} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {userProfile?.role && (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <FormControl>
                    <Input value={userProfile.role} disabled />
                  </FormControl>
                </FormItem>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <UpdatePasswordForm /> {/* Nuevo componente para actualizar contraseña */}
    </div>
  );
};

export default Profile;