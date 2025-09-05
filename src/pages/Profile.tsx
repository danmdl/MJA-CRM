import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const { session } = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    let ignore = false;

    async function getAndFixProfile() {
      if (!session?.user) return;
      setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select(`first_name, last_name, role`)
        .eq('id', session.user.id)
        .single();

      if (!ignore) {
        if (error && error.code === 'PGRST116') {
          // Caso 1: El perfil no existe. Lo creamos como administrador.
          console.log('Perfil no encontrado, creando perfil de administrador.');
          const { error: insertError } = await supabase.from('profiles').insert({
            id: session.user.id,
            role: 'admin',
          });

          if (insertError) {
            showError('Error al crear el perfil de administrador.');
            console.error(insertError);
          } else {
            showSuccess('Perfil de admin creado. Cierra sesión y vuelve a entrar.');
          }
        } else if (error) {
          // Otro tipo de error
          showError('Error al cargar el perfil.');
          console.warn(error);
        } else if (data) {
          // Caso 2: El perfil existe. Verificamos el rol.
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');

          if (data.role !== 'admin') {
            console.log('El rol no es de admin, actualizando...');
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ role: 'admin' })
              .eq('id', session.user.id);
            
            if (updateError) {
              showError('No se pudo actualizar tu rol a administrador.');
              console.error(updateError);
            } else {
              showSuccess('Rol actualizado a admin. Cierra sesión y vuelve a entrar.');
            }
          }
        }
      }
      setLoading(false);
    }

    getAndFixProfile();

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
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tu Perfil</CardTitle>
          <CardDescription>
            Aquí puedes actualizar tu información. Si tu rol fue actualizado, por favor cierra sesión y vuelve a iniciarla para acceder al panel de admin.
          </CardDescription>
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
            <Button type="button" variant="secondary" onClick={handleLogout}>
              Cerrar Sesión
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