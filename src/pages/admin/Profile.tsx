import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import PasswordChangeForm from '@/components/auth/PasswordChangeForm'; // Importar el nuevo componente

const AdminProfile = () => {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    async function getProfile() {
      if (!session?.user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select(`first_name, last_name`)
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.warn(error);
        showError('Error al cargar el perfil.');
      } else if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
      }
      setLoading(false);
    }

    getProfile();
  }, [session]);

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.user) return;

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);

    if (error) {
      showError(error.message);
    } else {
      showSuccess('¡Perfil actualizado con éxito!');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6"> {/* Añadido espacio entre las tarjetas */}
      <h1 className="text-3xl font-bold mb-6">Perfil</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Tu Información Personal</CardTitle>
          <CardDescription>Actualiza tu información personal aquí.</CardDescription>
        </CardHeader>
        <form onSubmit={handleUpdateProfile}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input type="email" value={session?.user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <PasswordChangeForm /> {/* Añadir el formulario de cambio de contraseña */}
    </div>
  );
};

export default AdminProfile;