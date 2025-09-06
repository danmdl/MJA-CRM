"use client";

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, Users, Info, Church as ChurchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';

interface ChurchSidebarProps {
  isCollapsed: boolean;
  churchId: string;
}

interface Church {
  id: string;
  name: string;
}

const fetchChurchName = async (churchId: string): Promise<string> => {
  const { data, error } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .single();

  if (error) {
    console.error('Error fetching church name:', error);
    throw new Error('No se pudo cargar el nombre de la iglesia.');
  }
  return data.name;
};

const ChurchSidebar = ({ isCollapsed, churchId }: ChurchSidebarProps) => {
  const { data: churchName, isLoading, isError, error } = useQuery<string>({
    queryKey: ['churchName', churchId],
    queryFn: () => fetchChurchName(churchId),
    enabled: !!churchId,
  });

  if (isError) {
    showError(error?.message || 'Error al cargar el nombre de la iglesia.');
  }

  const navItems = [
    { to: `/admin/churches/${churchId}/overview`, icon: Info, label: "Resumen" },
    { to: `/admin/churches/${churchId}/database`, icon: Database, label: "Base de Datos" },
    { to: `/admin/churches/${churchId}/team`, icon: Users, label: "Equipo" },
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
        {isLoading ? (
          <Skeleton className={cn("h-6", isCollapsed ? "w-6" : "w-3/4")} />
        ) : (
          <>
            {!isCollapsed && <h2 className="text-xl font-bold tracking-tight break-words whitespace-normal">{churchName || "Cargando..."}</h2>}
            {isCollapsed && <ChurchIcon className="h-6 w-6 text-primary" />}
          </>
        )}
      </div>
      <nav className="flex flex-col p-2 flex-grow space-y-1"> {/* Added flex-grow here */}
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
      {/* Removed SidebarFooter from here */}
    </aside>
  );
};

export default ChurchSidebar;