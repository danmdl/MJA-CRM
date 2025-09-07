"use client";

import React, { useState, useEffect } from 'react';
// Importaciones de react-hook-form y zod eliminadas temporalmente
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
// Importaciones de Form, FormField, etc. eliminadas temporalmente
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Añadido Label
// Importaciones de Select eliminadas temporalmente
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';

// Definir el tipo de rol de usuario (aunque no se usa en este paso, lo mantengo para futuras referencias)
type UserRole = 'admin' | 'general' | 'pastor' | 'piloto' | 'encargado_de_celula' | 'user';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const { session } = useSession();

  useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevenir el comportamiento por defecto del formulario
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
          email: email,
          password: password,
          role: 'user', // Valor por defecto temporal
          churchId: null, // Valor por defecto temporal
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Edge Function response error:', data);
        showError(data.error || 'Error desconocido al invocar la función.');
        setLoading(false);
        return;
      }

      showSuccess('¡Usuario creado con éxito!');
      setEmail('');
      setPassword('');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Introduce los detalles para crear una nueva cuenta de usuario.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="text" // Visible
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};