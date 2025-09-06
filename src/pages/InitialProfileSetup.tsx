"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { useNavigate } from 'react-router-dom';

const profileSchema = z.object({
  first_name: z.string().min(1, { message: 'El nombre es obligatorio.' }),
  last_name: z.string().min(1, { message: 'El apellido es obligatorio.' }),
});

const InitialProfileSetup = () => {
  const { session, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
    },
  });

  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate('/login');
    } else if (!sessionLoading && session) {
      // Check if profile already has first_name and last_name
      const checkProfile = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          // If profile doesn't exist or error, assume it needs to be created/updated
        } else if (data && data.first_name && data.last_name) {
          // If profile already complete, redirect to password setup or home
          navigate('/password-setup'); // Or directly to '/' if password is also set
          return;
        }
        setLoading(false);
      };
      checkProfile();
    }
  }, [session, sessionLoading, navigate]);

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    if (!session?.user) {
      showError('No hay sesión de usuario activa.');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        first_name: values.first_name,
        last_name: values.last_name,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }); // Use upsert to insert or update

    if (error) {
      showError(error.message);
    } else {
      showSuccess('¡Información de perfil guardada con éxito!');
      navigate('/password-setup'); // Redirect to password setup
    }
    setLoading(false);
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Completa tu Perfil</CardTitle>
          <CardDescription>
            Por favor, introduce tu nombre y apellido para continuar.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="first_name">Nombre</FormLabel>
                    <FormControl>
                      <Input id="first_name" {...field} disabled={loading} />
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
                    <FormLabel htmlFor="last_name">Apellido</FormLabel>
                    <FormControl>
                      <Input id="last_name" {...field} disabled={loading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Continuar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
};

export default InitialProfileSetup;