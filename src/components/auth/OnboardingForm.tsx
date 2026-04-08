"use client";
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';

const onboardingSchema = z.object({
  firstName: z.string().trim().min(1, { message: 'El nombre es obligatorio.' }),
  lastName: z.string().trim().min(1, { message: 'El apellido es obligatorio.' }),
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

interface Props {
  onSuccess?: () => void;
}

const OnboardingForm = ({ onSuccess }: Props) => {
  const { session } = useSession();
  const meta = session?.user?.user_metadata || {};
  const inviterName = meta.invited_by_name as string | undefined;
  const churchName = meta.invited_to_church_name as string | undefined;
  const cuerda = meta.numero_cuerda as string | undefined;

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<z.infer<typeof onboardingSchema>>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      firstName: (meta.first_name as string) || '',
      lastName: (meta.last_name as string) || '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof onboardingSchema>) => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      // 1. Set the password
      const { error: pwErr } = await supabase.auth.updateUser({
        password: values.password,
        data: { first_name: values.firstName.trim(), last_name: values.lastName.trim() },
      });
      if (pwErr) { showError(pwErr.message); setLoading(false); return; }

      // 2. Update the profile row with the names + mark as completed
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          profile_completed: true,
        })
        .eq('id', session.user.id);
      if (profileErr) { showError(profileErr.message); setLoading(false); return; }

      // Polished in-app success state, then dismiss
      setDone(true);
      setTimeout(() => { onSuccess?.(); }, 1600);
    } catch (e: any) {
      showError(e?.message || 'Error inesperado.');
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 flex flex-col items-center text-center gap-4">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <div>
            <h2 className="text-xl font-semibold">¡Tu cuenta está lista!</h2>
            <p className="text-sm text-muted-foreground mt-1">Bienvenido/a a MJA CRM. Te estamos llevando al panel...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build the personalized welcome string
  const welcomeBits: string[] = [];
  if (inviterName) welcomeBits.push(`${inviterName} te invitó`);
  if (cuerda) welcomeBits.push(`a la Cuerda ${cuerda}`);
  if (churchName) welcomeBits.push(`en ${churchName}`);
  const welcomeLine = welcomeBits.length > 0 ? welcomeBits.join(' ') + '.' : 'Te invitamos a unirte al equipo.';

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Crea tu usuario</CardTitle>
        <CardDescription>{welcomeLine} Completá tus datos para activar tu cuenta.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} disabled={loading} placeholder="Juan" autoComplete="given-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} disabled={loading} placeholder="Pérez" autoComplete="family-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        {...field}
                        disabled={loading}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar contraseña <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirm ? 'text' : 'password'}
                        {...field}
                        disabled={loading}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creando tu cuenta...' : 'Crear cuenta'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default OnboardingForm;
