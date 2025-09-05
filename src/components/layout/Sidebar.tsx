import { NavLink } from 'react-router-dom';
import { User, Database, Users, FileText } from 'lucide-react'; // Importar FileText
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';

const Sidebar = () => {
  return (
    <aside className="w-64 bg-background border-r hidden md:flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Panel de Admin</h2>
      </div>
      <nav className="flex flex-col p-2 flex-grow">
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
        <NavLink
          to="/admin/csv-deduplicator" // Nuevo enlace
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              isActive && 'bg-muted text-primary'
            )
          }
        >
          <FileText className="h-4 w-4" /> {/* Icono para el deduplicador */}
          Deduplicar CSV
        </NavLink>
      </nav>
      <SidebarFooter />
    </aside>
  );
};

export default Sidebar;