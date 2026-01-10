import { NavLink, Link } from 'react-router-dom';
import { User, Database, Users, FileSpreadsheet, LayoutDashboard, Church, Key, MessageSquare, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';

interface SidebarProps {
  isCollapsed: boolean;
}

const Sidebar = ({ isCollapsed }: SidebarProps) => {
  const { profile } = useSession();
  const { canEditDeleteUsers } = usePermissions();

  // Define all possible navigation items
  const allNavItems = [
    { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ['admin', 'general'] },
    { to: "/admin/churches", icon: Church, label: "Ministerio", roles: ['admin', 'general', 'pastor', 'referente', 'encargado_de_celula'] },
    { to: "/admin/csv-deduplicator", icon: FileSpreadsheet, label: "Limpiar CSV", roles: ['admin', 'general', 'pastor', 'referente', 'encargado_de_celula'] },
    { to: "/admin/login-management", icon: Key, label: "Gestión de Usuarios", roles: ['admin', 'general'], requiresPermission: 'add_users' },
    { to: "/admin/permissions", icon: Shield, label: "Permisos", roles: ['admin'], requiresPermission: 'edit_delete_users' },
    { to: "/admin/profile", icon: User, label: "Perfil", roles: ['admin', 'general'] },
    { to: "/admin/messages", icon: MessageSquare, label: "Mensajes", roles: ['admin', 'general', 'pastor', 'referente', 'encargado_de_celula'] }
  ];

  // Filter navigation items based on user's role and permissions
  const navItems = allNavItems.filter(item => {
    const hasRoleAccess = item.roles.includes(profile?.role || 'user');
    const hasPermissionAccess = !item.requiresPermission || canEditDeleteUsers();
    return hasRoleAccess && hasPermissionAccess;
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