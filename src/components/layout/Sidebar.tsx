import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  return (
    <aside className="w-64 bg-background border-r hidden md:block">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold tracking-tight">Panel de Admin</h2>
      </div>
      <nav className="flex flex-col p-2">
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              isActive && 'bg-muted text-primary'
            )
          }
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
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
          Equipo
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;