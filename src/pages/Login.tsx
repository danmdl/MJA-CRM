import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { useTheme } from 'next-themes';

const Login = () => {
  const { session } = useSession();
  const { theme } = useTheme();

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-md supabase-custom-theme">
        <div className="text-center">
            <h2 className="text-2xl font-bold">Bienvenido</h2>
            <p className="text-muted-foreground">Inicia sesión para continuar</p>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          theme={theme === 'dark' ? 'dark' : 'light'}
        />
      </div>
    </div>
  );
};

export default Login;