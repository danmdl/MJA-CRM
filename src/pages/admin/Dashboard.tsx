"use client";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building, BarChart, Shield, AlertCircle, Eye } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { usePermissions } from '@/lib/permissions';
import { showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';

interface DashboardStats {
  totalUsers: number;
  totalChurches: number;
  totalContacts: number;
  totalCells: number;
}

const Dashboard = () => {
  const { profile } = useSession();
  const { canSeeAllAnalytics, canSeeOwnChurchAnalytics } = usePermissions();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalChurches: 0,
    totalContacts: 0,
    totalCells: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        if (!canSeeAllAnalytics() && !canSeeOwnChurchAnalytics()) {
          setStats({ totalUsers: 0, totalChurches: 0, totalContacts: 0, totalCells: 0 });
          setLoading(false);
          return;
        }

        // Fetch stats based on permissions
        let query = 'total_contacts,total_cells';
        let url = `https://jczsgvaednptnypxhcje.supabase.co/functions/v1/get-dashboard-stats`;
        if (canSeeAllAnalytics()) {
          // Admin can see all stats
          url += `?stats=${query}`;
        } else if (canSeeOwnChurchAnalytics() && profile?.church_id) {
          // User can only see their church stats
          url += `?church_id=${profile.church_id}&stats=${query}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Error fetching dashboard stats');
        }

        const data = await response.json();
        setStats(data);
      } catch (error: any) {
        console.error('Error fetching dashboard stats:', error);
        showError('Error al cargar las estadísticas');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [profile, canSeeAllAnalytics, canSeeOwnChurchAnalytics]);

  // If user doesn't have any analytics permissions
  if (!canSeeAllAnalytics() && !canSeeOwnChurchAnalytics()) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <BarChart className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-xl">Acceso Restringido</CardTitle>
            <CardDescription>
              No tienes permisos para ver analíticas
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Para ver las estadísticas del dashboard, necesitas al menos uno de estos permisos:
            </p>
            <div className="flex flex-col gap-2 text-left max-w-md mx-auto">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Ver todas las analíticas</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Ver analíticas de mi iglesia</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Contacta a un administrador si necesitas acceso a las estadísticas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-4 w-16"></div>
                  <div className="h-12 bg-gray-200 rounded w-24"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          {canSeeAllAnalytics() ? "Estadísticas generales del sistema" : `Estadísticas de tu iglesia`}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contactos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts}</div>
            <p className="text-xs text-muted-foreground">
              {canSeeAllAnalytics() ? "Total en el sistema" : "En tu iglesia"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Células</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCells}</div>
            <p className="text-xs text-muted-foreground">
              {canSeeAllAnalytics() ? "Total en el sistema" : "En tu iglesia"}
            </p>
          </CardContent>
        </Card>
        {canSeeAllAnalytics() && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Iglesias</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalChurches}</div>
                <p className="text-xs text-muted-foreground">Total en el sistema</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuarios</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground">Total en el sistema</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;