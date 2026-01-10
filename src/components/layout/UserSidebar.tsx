import { NavLink, Link } from 'react-router-dom';
import { User, Database, Users, FileSpreadsheet, LayoutDashboard, Church, Key, MessageSquare, Shield, BarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';

interface UserSidebarProps {
  isCollapsed: boolean;
}

const UserSidebar = ({ isCollapsed }: UserSidebarProps) => {
  const { profile } = useSession();
  const { canAddUsers, canEditDeleteUsers, canSeeAllAnalytics } = usePermissions();

  // Same navigation as admin sidebar - unified experience
  const navItems = [
    { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/admin/churches", icon: Church, label: "Ministerio" },
    { to: "/admin/csv-deduplicator", icon: FileSpreadsheet, label: "Limpiar CSV" },
    { to: "/admin/login-management", icon: Key, label: "Gestión de Usuarios" },
    { to: "/admin/permissions", icon: Shield, label: "Permisos" },
    { to: "/admin/profile", icon: User, label: "Perfil" },
    { to: "/admin/messages", icon: MessageSquare, label: "Mensajes" },
  ];

  // Filter navigation items based on permissions, not roles
  const filteredNavItems = navItems.filter(item => {
    if (item.to === "/admin/login-management") return canAddUsers();
    if (item.to === "/admin/permissions") return canEditDeleteUsers();
    if (item.to === "/admin/dashboard") return canSeeAllAnalytics();
    return true; // Everyone can access basic tabs
  });

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
        {filteredNavItems.map((item) => (
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

export default UserSidebar;