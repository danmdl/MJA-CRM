import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';

const Login = () => {
  const { session } = useSession();

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background"> {/* Usar bg-background */}
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-md"> {/* Usar bg-card */}
        <div className="text-center">
            <h2 className="text-2xl font-bold">Bienvenido</h2>
            <p className="text-muted-foreground">Inicia sesión para continuar</p> {/* Usar text-muted-foreground */}
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          theme="light" // Supabase Auth UI tiene su propio tema, lo mantenemos en light para que se vea bien con el fondo oscuro de la app.
        />
      </div>
    </div>
  );
};

export default Login;