import { NavLink, useNavigate } from 'react-router-dom'; // Importar useNavigate
import { User, Database, Users, LogOut } from 'lucide-react'; // Importar LogOut icon
import { cn } from '@/lib/utils';
import { ModeToggle } from '@/components/ModeToggle';
import { Button } from '@/components/ui/button'; // Importar Button
import { supabase } from '@/integrations/supabase/client'; // Importar supabase

const Sidebar = () => {
  const navigate = useNavigate(); // Inicializar useNavigate

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-background border-r hidden md:block">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Panel de Admin</h2>
        <ModeToggle />
      </div>
      <nav className="flex flex-col p-2">
        <NavLink
          to="/admin/profile"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              isActive && 'bg-muted text-primary'
            )
          }
        >
          <User className="h-4 w-4" />
          Perfil
        </NavLink>
        <NavLink
          to="/admin/database"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              isActive && 'bg-muted text-primary'
            )
          }
        >
          <Database className="h-4 w-4" />
          Base de Datos
        </NavLink>
        <NavLink
          to="/admin/manage-team"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              isActive && 'bg-muted text-primary'
            )
          }
        >
          <Users className="h-4 w-4" />
          Manejar Equipo
        </NavLink>
      </nav>
      <div className="p-4 border-t mt-auto"> {/* Añadir un div para el botón de cerrar sesión */}
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-primary" 
          onClick={handleLogout}
        >
          <LogOut className="mr-3 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;