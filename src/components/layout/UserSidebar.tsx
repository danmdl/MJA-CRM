import { NavLink, Link } from 'react-router-dom';
import { User, LayoutDashboard, FileSpreadsheet, Church } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';

interface UserSidebarProps {
  isCollapsed: boolean;
}

const UserSidebar = ({ isCollapsed }: UserSidebarProps) => {
  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/profile", icon: User, label: "Perfil" },
    { to: "/csv-deduplicator", icon: FileSpreadsheet, label: "Limpiar CSV" },
    { to: "/admin/churches", icon: Church, label: "Mis Iglesias" }, // Changed label to be more specific
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
        {!isCollapsed && <h2 className="text-xl font-bold tracking-tight">MJA Central</h2>}
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
        <Link to="/messages" className="block rounded px-3 py-2 hover:bg-muted">Mensajes</Link>
      </nav>
      <SidebarFooter isCollapsed={isCollapsed} />
    </aside>
  );
};

export default UserSidebar;