import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { Link } from 'react-router-dom';

const Profile = () => {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    let ignore = false;

    async function createProfile() {
      if (!session?.user) return;
      try {
        setLoading(true);
        showSuccess('Creando tu perfil de administrador...');
        const { error } = await supabase.from('profiles').insert({
          id: session.user.id,
          role: 'admin', // Asignar rol de admin al crear
        });
        if (error) throw error;
        showSuccess('¡Perfil de administrador creado! Por favor, completa tus datos.');
      } catch (error: any) {
        showError('Error al crear el perfil: ' + error.message);
      }
    }

    async function getProfile() {
      if (!session?.user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select(`first_name, last_name`)
        .eq('id', session.user.id)
        .single();

      if (!ignore) {
        if (error && error.code === 'PGRST116') {
          // Profile not found, so create it.
          console.log('Profile not found, creating one.');
          await createProfile();
          // After creating, we can assume first/last name are empty
          setFirstName('');
          setLastName('');
        } else if (error) {
          console.warn(error);
          showError('Error al cargar el perfil.');
        } else if (data) {
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');
        }
      }
      setLoading(false);
    }

    getProfile();

    return () => {
      ignore = true;
    };
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tu Perfil</CardTitle>
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
          <CardFooter className="flex justify-between">
            <Button variant="link" asChild>
              <Link to="/">Volver al inicio</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Profile;