import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useNavigate, Link } from "react-router-dom";

const Index = () => {
  const { session } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white shadow-md rounded-lg">
        <h1 className="text-4xl font-bold mb-4">¡Bienvenido!</h1>
        <p className="text-xl text-gray-600 mb-6">
          Has iniciado sesión correctamente.
        </p>
        {session && (
          <p className="text-md text-gray-500 mb-2">
            Sesión iniciada como: {session.user.email}
          </p>
        )}
        <div className="flex gap-4 justify-center">
            <Button asChild>
                <Link to="/profile">Ir al Perfil</Link>
            </Button>
            <Button onClick={handleLogout} variant="outline">Cerrar sesión</Button>
        </div>
      </div>
    </div>
  );
};

export default Index;