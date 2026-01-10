"use client";

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, Users, GitFork, Church } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';

interface ChurchSidebarProps {
  isCollapsed: boolean;
}

const ChurchSidebar = ({ isCollapsed }: ChurchSidebarProps) => {
  const { churchId } = useParams<{ churchId: string }>();

  const navItems = [
    { to: `/admin/churches/${churchId}/overview`, icon: LayoutDashboard, label: "Resumen" },
    { to: `/admin/churches/${churchId}/database`, icon: Database, label: "Base de Datos" },
    { to: `/admin/churches/${churchId}/team`, icon: Users, label: "Equipo" },
    { to: `/admin/churches/${churchId}/cells`, icon: GitFork, label: "Células" },
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
        {!isCollapsed && <h2 className="text-xl font-bold tracking-tight">Detalles Iglesia</h2>}
        {isCollapsed && <Church className="h-6 w-6 text-primary" />}
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
    </aside>
  );
};

export default ChurchSidebar;