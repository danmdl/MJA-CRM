import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useNavigate, Link } from "react-router-dom";

const Index = () => {
  const { session } = useSession();
  const navigate = useNavigate();

  // handleLogout se ha movido al SidebarFooter

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="text-center p-8 bg-card shadow-md rounded-lg">
        <h1 className="text-4xl font-bold mb-4">¡Bienvenido!</h1>
        <p className="text-xl text-muted-foreground mb-6">
          Has iniciado sesión correctamente.
        </p>
        {session && (
          <p className="text-md text-muted-foreground mb-2">
            Sesión iniciada como: {session.user.email}
          </p>
        )}
        <div className="flex gap-4 justify-center">
            <Button asChild>
                <Link to="/profile">Ir al Perfil</Link>
            </Button>
            {/* El botón de cerrar sesión se ha movido al SidebarFooter */}
        </div>
      </div>
    </div>
  );
};

export default Index;