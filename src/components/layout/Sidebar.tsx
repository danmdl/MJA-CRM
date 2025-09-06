import { NavLink } from 'react-router-dom';
import { User, Database, Users, FileSpreadsheet, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import SidebarFooter from './SidebarFooter';
import { Session } from '@supabase/supabase-js'; // Import Session type

interface SidebarProps {
  isCollapsed: boolean;
  userSession: Session | null; // Pass the entire session object
}

const Sidebar = ({ isCollapsed, userSession }: SidebarProps) => {
  // Determine user role from session metadata or profile (assuming profile is loaded)
  // For now, we'll use a simple check. In a more complex app, you might fetch the profile here.
  const userRole = userSession?.user?.user_metadata?.role || 'user'; // Default to 'user'

  const allNavItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ['admin', 'general', 'pastor', 'piloto', 'encargado_de_celula', 'user'] },
    { to: "/profile", icon: User, label: "Perfil", roles: ['admin', 'general', 'pastor', 'piloto', 'encargado_de_celula', 'user'] },
    { to: "/database", icon: Database, label: "Base de Datos", roles: ['admin', 'general', 'pastor', 'piloto', 'encargado_de_celula'] },
    { to: "/manage-team", icon: Users, label: "Manejar Equipo", roles: ['admin'] }, // Only for admin
    { to: "/csv-deduplicator", icon: FileSpreadsheet, label: "Limpiar CSV", roles: ['admin', 'general'] },
  ];

  // Filter nav items based on user's role
  const navItems = allNavItems.filter(item => item.roles.includes(userRole));

  return (
    <aside className={cn(
      "bg-background border-r flex flex-col h-full transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <div className={cn(
        "p-4 border-b flex items-center",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && <h2 className="text-xl font-bold tracking-tight">MJA Central</h2>} {/* Changed title back */}
        {isCollapsed && <LayoutDashboard className="h-6 w-6 text-primary" />}
      </div>
      <nav className="flex flex-col p-2 flex-grow space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            // Prepend /admin to routes if the user is an admin, otherwise use root path
            to={userRole === 'admin' ? `/admin${item.to}` : item.to}
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