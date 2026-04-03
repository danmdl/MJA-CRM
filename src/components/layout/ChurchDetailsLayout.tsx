"use client";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/lib/permissions";
import { showError } from "@/utils/toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { isReferenceRole } from "@/lib/roles";

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const { canAccessAllChurches, canSeeBaseDatos, canSeePool, canSeeOwnChurchAnalytics, canSeeCelulas, canSeeHistorial } = usePermissions();
  const canSeeOverview = canAccessAllChurches() || canSeeOwnChurchAnalytics();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!churchId) {
      showError("Error: No se encontró el ID de la iglesia.");
      navigate("/admin/churches", { replace: true });
      return;
    }

    const canAccessAll = canAccessAllChurches();
    const isAssignedToChurch = profile?.church_id === churchId;


    if (!canAccessAll && !isAssignedToChurch) {
      showError("No tienes permiso para acceder a los detalles de esta iglesia.");
      navigate("/admin/churches", { replace: true });
    } else {
      setAccessChecked(true);
    }
  }, [churchId, profile, sessionLoading, navigate, location.pathname]);

  const { data: churchData, isLoading: nameLoading } = useQuery({
    queryKey: ["churchName", churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churches")
        .select("name")
        .eq("id", churchId)
        .single();
      
      if (error) {
        return { name: "" };
      }
      
      return data as { name: string };
    },
    enabled: !!churchId,
  });

  const { data: totalCount } = useQuery({
    queryKey: ["contacts-count", churchId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("church_id", churchId!);
      
      if (error) return 0;
      return count || 0;
    },
    enabled: !!churchId,
    staleTime: 30_000,
  });

  const activeTab = (() => {
    const p = location.pathname;
    if (p.endsWith("/overview")) return "overview";
    if (p.endsWith("/database")) return "database";
    if (p.endsWith("/team")) return "team";
    if (p.endsWith("/cuerdas")) return "cuerdas";
    if (p.endsWith("/celulas")) return "celulas";
    if (p.endsWith("/mapa")) return "mapa";
    if (p.endsWith("/pool")) return "pool";
    if (p.endsWith("/historial")) return "historial";
    if (p.endsWith("/papelera")) return "papelera";
    return "overview";
  })();

  // Redirect if user lands on a tab they can't access
  React.useEffect(() => {
    if (!accessChecked || sessionLoading) return;
    const p = location.pathname;
    if (p.endsWith('/overview') && !canSeeOverview) {
      navigate(`/admin/churches/${churchId}/pool`, { replace: true });
    }
  }, [accessChecked, sessionLoading, location.pathname, canSeeOverview, churchId, navigate]);

  if (!accessChecked || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso a la iglesia...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Church header - compact on mobile */}
      <div className="border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight truncate">
            {nameLoading ? <Skeleton className="h-6 w-40" /> : churchData?.name || "Iglesia"}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground">Contactos:</span>
            <span className="text-lg font-bold">{totalCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Scrollable tabs - important on mobile */}
      <div className="border-b bg-background">
        <div className="overflow-x-auto">
          <Tabs
            value={activeTab}
            onValueChange={(val) => navigate(`/admin/churches/${churchId}/${val}`)}
            className="w-full px-3"
          >
            <TabsList className="mb-0 w-max">
              {canSeeOverview && <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3">Resumen</TabsTrigger>}
              {canSeeBaseDatos() && <TabsTrigger value="database" className="text-xs sm:text-sm px-2 sm:px-3">Base de Datos</TabsTrigger>}
              {canSeeOverview && <TabsTrigger value="team" className="text-xs sm:text-sm px-2 sm:px-3">Equipo</TabsTrigger>}
              {canSeeOverview && <TabsTrigger value="cuerdas" className="text-xs sm:text-sm px-2 sm:px-3">Cuerdas</TabsTrigger>}
              {canSeeCelulas() && <TabsTrigger value="celulas" className="text-xs sm:text-sm px-2 sm:px-3">Células</TabsTrigger>}
              {canSeeOverview && <TabsTrigger value="mapa" className="text-xs sm:text-sm px-2 sm:px-3">🗺️ Mapa</TabsTrigger>}
              {canSeePool() && <TabsTrigger value="pool" className="text-xs sm:text-sm px-2 sm:px-3">🏊 Pool</TabsTrigger>}
              {canSeeHistorial() && <TabsTrigger value="historial" className="text-xs sm:text-sm px-2 sm:px-3">📋 Historial</TabsTrigger>}
              {canSeeOverview && <TabsTrigger value="papelera" className="text-xs sm:text-sm px-2 sm:px-3">🗑️ Papelera</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main content area */}
      <main className="flex-1 p-3 sm:p-6 overflow-auto">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default ChurchDetailsLayout;