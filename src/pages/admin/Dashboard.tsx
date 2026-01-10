"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import DashboardStatCard from '@/components/admin/DashboardStatCard';
import { Church, Users, CalendarCheck, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { showError } from '@/utils/toast';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  churches: number;
  users: number;
  contacts: number;
  activity: number;
}

const fetchDashboardStats = async (accessToken: string): Promise<DashboardStats> => {
  const edgeFunctionUrl = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/get-dashboard-stats`;
  const response = await fetch(edgeFunctionUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error fetching dashboard stats from Edge Function:', errorData);
    throw new Error(errorData.error || 'No se pudieron cargar las estadísticas del dashboard.');
  }

  const data = await response.json();
  return data;
};

const AdminDashboard = () => {
  const { session } = useSession();

  const { data: stats, isLoading, isError, error } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: () => fetchDashboardStats(session?.access_token || ''),
    enabled: !!session?.access_token,
  });

  if (isError) {
    showError(error?.message || 'Error al cargar las estadísticas del dashboard.');
  }

  return (
    <div className="flex flex-col h-full w-full p-6"> {/* Added p-6 here */}
      <h1 className="text-3xl font-bold mb-2">Dashboard de Administración</h1>
      <p className="text-muted-foreground mb-6">Gestión integral de iglesias y usuarios</p>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DashboardStatCard
            title="Iglesias"
            value={stats?.churches || 0}
            description="Iglesias registradas"
            icon={Church}
            iconBgColor="bg-blue-100 dark:bg-blue-900/20"
            iconColor="text-blue-600 dark:text-blue-400"
            valueColor="text-blue-600 dark:text-blue-400"
          />
          <DashboardStatCard
            title="Usuarios"
            value={stats?.users || 0}
            description="Usuarios activos"
            icon={Users}
            iconBgColor="bg-green-100 dark:bg-green-900/20"
            iconColor="text-green-600 dark:text-green-400"
            valueColor="text-green-600 dark:text-green-400"
          />
          <DashboardStatCard
            title="Contactos"
            value={stats?.contacts || 0}
            description="Contactos registrados"
            icon={CalendarCheck}
            iconBgColor="bg-yellow-100 dark:bg-yellow-900/20"
            iconColor="text-yellow-600 dark:text-yellow-400"
            valueColor="text-yellow-600 dark:text-yellow-400"
          />
          <DashboardStatCard
            title="Actividad"
            value={stats?.activity || 0}
            description="Acciones hoy"
            icon={Activity}
            iconBgColor="bg-red-100 dark:bg-red-900/20"
            iconColor="text-red-600 dark:text-red-400"
            valueColor="text-red-600 dark:text-red-400"
          />
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;