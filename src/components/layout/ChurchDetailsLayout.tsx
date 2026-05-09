"use client";
import React, { useEffect, useState, useTransition } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/lib/permissions";
import { showError } from "@/utils/toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const { canAccessAllChurches, canSeePool, canSeeOwnChurchAnalytics, canSeeCelulas, canSeeHistorial, canSeeCuerdas, canAddMembers, canSeeMapa, canSeeValidador, canSeePapelera, canSeeProcesos } = usePermissions();
  const canSeeOverview = canAccessAllChurches() || canSeeOwnChurchAnalytics();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  const activeTab = (() => {
    const p = location.pathname;
    if (p.endsWith("/overview")) return "overview";
    if (p.endsWith("/team")) return "team";
    if (p.endsWith("/cuerdas")) return "cuerdas";
    if (p.endsWith("/celulas")) return "celulas";
    if (p.endsWith("/procesos")) return "procesos";
    if (p.endsWith("/mapa")) return "mapa";
    if (p.endsWith("/pool")) return "pool";
    if (p.endsWith("/historial")) return "historial";
    if (p.endsWith("/papelera")) return "papelera";
    if (p.endsWith("/validator")) return "validator";
    if (p.endsWith("/hogares")) return "hogares";
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
      {/* Church header + tabs combined into a single compact row */}
      <div className="border-b bg-background">
        <div className="flex items-center gap-3 px-3 sm:px-4">
          {/* Church name + divider hidden on mobile — on a 380px-wide
              phone screen, "MJA Central" plus the separator was eating
              ~40% of the width and pushing the tabs into a horizontal
              scroller that hid the active tab on first paint. The
              breadcrumb / title is already implied by the URL and the
              page header below it, so dropping it on small screens
              just gives the tab strip room to breathe. Reappears at
              sm: (640px) and up. */}
          <h2 className="hidden sm:block text-base sm:text-lg font-bold tracking-tight whitespace-nowrap py-2">
            {nameLoading ? <Skeleton className="h-5 w-32" /> : churchData?.name || "Iglesia"}
          </h2>
          <div className="hidden sm:block h-6 w-px bg-border shrink-0" />
          <div className="flex-1 overflow-x-auto">
            <Tabs
              value={activeTab}
              onValueChange={(val) => startTransition(() => navigate(`/admin/churches/${churchId}/${val}`))}
              className="w-full"
            >
              <TabsList className="mb-0 w-max">
                {/* Resumen lives in the left sidebar now, not the tab
                    strip. Per Dan: 'resumen debería solamente ser un
                    botón del menú de la izquierda... siempre cuando me
                    lo veo debería empezar en semillero'. The page
                    itself (ChurchOverviewPage at /overview) still
                    exists and the sidebar links to it; we just stop
                    duplicating it here as a tab that competed with
                    the actual workflow tabs. */}
                {canSeePool() && <TabsTrigger value="pool" className="text-xs sm:text-sm px-2 sm:px-3">🌱 Semillero</TabsTrigger>}
                {canSeeProcesos() && <TabsTrigger value="procesos" className="text-xs sm:text-sm px-2 sm:px-3">⚡ Procesos</TabsTrigger>}
                {canSeeCuerdas() && <TabsTrigger value="cuerdas" className="text-xs sm:text-sm px-2 sm:px-3">Cuerdas</TabsTrigger>}
                {canSeeCelulas() && <TabsTrigger value="celulas" className="text-xs sm:text-sm px-2 sm:px-3">Células</TabsTrigger>}
                {canAddMembers() && <TabsTrigger value="team" className="text-xs sm:text-sm px-2 sm:px-3">Equipo</TabsTrigger>}
                {canSeeCelulas() && <TabsTrigger value="hogares" className="text-xs sm:text-sm px-2 sm:px-3">🕊️ Hogares de Paz</TabsTrigger>}
                {canSeeMapa() && <TabsTrigger value="mapa" className="text-xs sm:text-sm px-2 sm:px-3">🗺️ Mapa</TabsTrigger>}
                {canSeeHistorial() && <TabsTrigger value="historial" className="text-xs sm:text-sm px-2 sm:px-3">📋 Historial</TabsTrigger>}
                {canSeeValidador() && <TabsTrigger value="validator" className="text-xs sm:text-sm px-2 sm:px-3">🛡️ Validador</TabsTrigger>}
                {canSeePapelera() && <TabsTrigger value="papelera" className="text-xs sm:text-sm px-2 sm:px-3">🗑️ Papelera</TabsTrigger>}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <main className={`flex-1 p-3 sm:p-6 overflow-auto transition-opacity duration-150 ${isPending ? 'opacity-60' : 'opacity-100'}`}>
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default ChurchDetailsLayout;