import { NavLink } from 'react-router-dom';
import { User, Database, Users, FileSpreadsheet, LayoutDashboard, Church } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';

interface SidebarProps {
  isCollapsed: boolean;
}

const Sidebar = ({ isCollapsed }: SidebarProps) => {
  const navItems = [
    { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/admin/churches", icon: Church, label: "Iglesias" },
    { to: "/admin/database", icon: Database, label: "Base de Datos" },
    { to: "/admin/manage-team", icon: Users, label: "Manejar Equipo" },
    { to: "/admin/csv-deduplicator", icon: FileSpreadsheet, label: "Deduplicar CSV" },
    { to: "/admin/profile", icon: User, label: "Perfil" },
  ];

  return (
    <aside className={cn(
      "bg-background border-r flex flex-col h-full transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <div className={cn(
        "p-4 border-b flex items-center",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && <h2 className="text-xl font-bold tracking-tight">Panel de Admin</h2>}
        {isCollapsed && <LayoutDashboard className="h-6 w-6 text-primary" />}
      </div>
      <nav className="flex flex-col p-2 flex-grow space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                isActive && 'bg-muted text-primary',
                isCollapsed ? "justify-center" : "gap-3"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {!isCollapsed && <span className="text-sm">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      <SidebarFooter isCollapsed={isCollapsed} />
    </aside>
  );
};

export default Sidebar;