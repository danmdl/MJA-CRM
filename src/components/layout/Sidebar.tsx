import { NavLink } from 'react-router-dom';
import { User, Database, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter'; // Importar el nuevo componente

const Sidebar = () => {
  return (
    <aside className="w-64 bg-background border-r hidden md:block">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Panel de Admin</h2>
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
      <SidebarFooter /> {/* Renderizar el nuevo componente de pie de página */}
    </aside>
  );
};

export default Sidebar;