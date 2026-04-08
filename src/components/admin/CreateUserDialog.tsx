"use client";
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { ROLE_LABELS, RoleKey } from '@/lib/roles';

interface Church {
  id: string;
  name: string;
}

interface CreateUserDialogProps {
  open: boolean;
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

type UserRole = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'conector' | 'consolidador' | 'supervisor';

const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { session, profile } = useSession();
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('conector');
  const [churchId, setChurchId] = useState('');

  // Cargar iglesias para el selector
  const { data: churches, isLoading: isLoadingChurches, isError: isErrorChurches, error: errorChurches } = useQuery<Church[]>({
    queryKey: ['churches'],
    queryFn: fetchChurches,
    enabled: open,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!email || !password || !firstName || !lastName || !role) {
      showError('Por favor, completa todos los campos requeridos.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError('Por favor, introduce un correo válido.');
      return;
    }

    // Password validation
    if (password.length < 6) {
      showError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

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
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          role,
          churchId: churchId === '' ? null : churchId,
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
      // Reset form
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setRole('conector');
      setChurchId('');
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
  const allowedRolesForCreation: UserRole[] = ['admin', 'general', 'pastor', 'supervisor', 'referente', 'encargado_de_celula', 'conector', 'anfitrion'];

  // Filtrar roles disponibles para el selector en la UI
  const availableRoles = allowedRolesForCreation.filter(roleOption => {
    if (!isAdmin && roleOption === 'general') {
      return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Introduce los detalles para crear una nueva cuenta de usuario. Todos los campos son obligatorios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Correo Electrónico</label>
            <Input 
              type="email"
              placeholder="nombre@ejemplo.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Contraseña</label>
            <Input 
              type="password"
              placeholder="Contraseña" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Nombre</label>
            <Input 
              placeholder="Primer Nombre" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Apellido</label>
            <Input 
              placeholder="Apellido" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Rol</label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>
                    {ROLE_LABELS[roleOption as RoleKey] || roleOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">Iglesia Asignada</label>
            <Select value={churchId} onValueChange={setChurchId} disabled={loading || isLoadingChurches}>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingChurches ? "Cargando iglesias..." : "Selecciona una iglesia"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin iglesia asignada</SelectItem>
                {churches?.map((church) => (
                  <SelectItem key={church.id} value={church.id}>
                    {church.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isLoadingChurches}>
              {loading ? 'Creando...' : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;