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
import { Eye, EyeOff } from 'lucide-react';

const passwordSchema = z.object({
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

const PasswordSetup = () => {
  const { session, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate('/login');
    } else if (!sessionLoading && session) {
      // Check if first_name and last_name are set. If not, redirect to InitialProfileSetup.
      const checkProfileCompletion = async () => {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        if (profileError || !profileData?.first_name || !profileData?.last_name) {
          navigate('/initial-profile-setup');
        }
      };
      checkProfileCompletion();
    }
  }, [session, sessionLoading, navigate]);

  const onSubmit = async (values: z.infer<typeof passwordSchema>) => {
    if (!session?.user) {
      showError('No hay sesión de usuario activa.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      showError(error.message);
    } else {
      showSuccess('¡Contraseña establecida con éxito! Redirigiendo...');
      navigate('/'); // Redirect to home page after password setup
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
          <CardTitle>Establece tu Contraseña</CardTitle>
          <CardDescription>
            Por favor, crea una contraseña segura para tu cuenta.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password">Nueva Contraseña</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                          disabled={loading}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={loading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="confirmPassword">Confirmar Nueva Contraseña</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          {...field}
                          disabled={loading}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        disabled={loading}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</span>
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading}>
                {loading ? 'Estableciendo...' : 'Establecer Contraseña'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
};

export default PasswordSetup;