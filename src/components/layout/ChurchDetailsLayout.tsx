"use client";
import React, { useEffect, useState, useTransition } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { usePermissions } from "@/lib/permissions";
import { showError } from "@/utils/toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const { canAccessAllChurches, canSeePool, canSeeOwnChurchAnalytics, canSeeCelulas, canSeeHistorial, canSeeCuerdas, canAddMembers, canSeeMapa, canSeeValidador, canSeePapelera, canSeeProcesos, canSeeRutas, canSeeEventos, canSeeAsistencia } = usePermissions();
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

  const activeTab = (() => {
    const p = location.pathname;
    if (p.endsWith("/overview")) return "overview";
    if (p.endsWith("/team")) return "team";
    if (p.endsWith("/cuerdas")) return "cuerdas";
    if (p.endsWith("/celulas")) return "celulas";
    if (p.endsWith("/procesos")) return "procesos";
    if (p.endsWith("/territorio")) return "territorio";
    if (p.endsWith("/pool")) return "pool";
    if (p.endsWith("/historial")) return "historial";
    if (p.endsWith("/papelera")) return "papelera";
    if (p.endsWith("/validator")) return "validator";
    if (p.endsWith("/hogares")) return "hogares";
    if (p.endsWith("/territorio")) return "territorio";
    if (p.includes("/rutas")) return "rutas";
    if (p.endsWith("/asistencia")) return "asistencia";
    if (p.endsWith("/eventos")) return "eventos";
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
      {/* Tabs — compact single row, no church name (already visible in sidebar/URL) */}
      <div className="border-b bg-background">
        <div className="overflow-x-auto px-1">
          <Tabs
            value={activeTab}
            onValueChange={(val) => startTransition(() => navigate(`/admin/churches/${churchId}/${val}`))}
            className="w-full"
          >
            <TabsList className="mb-0 w-max">
              {canSeePool() && <TabsTrigger value="pool" className="text-xs sm:text-sm px-2 sm:px-3">🌱 Semillero</TabsTrigger>}
              {canSeeProcesos() && <TabsTrigger value="procesos" className="text-xs sm:text-sm px-2 sm:px-3">⚡ Procesos</TabsTrigger>}
              {canSeeCuerdas() && <TabsTrigger value="cuerdas" className="text-xs sm:text-sm px-2 sm:px-3">Cuerdas</TabsTrigger>}
              {canSeeCelulas() && <TabsTrigger value="celulas" className="text-xs sm:text-sm px-2 sm:px-3">Células</TabsTrigger>}
              {canAddMembers() && <TabsTrigger value="team" className="text-xs sm:text-sm px-2 sm:px-3">Equipo</TabsTrigger>}
              {canSeeCelulas() && <TabsTrigger value="hogares" className="text-xs sm:text-sm px-2 sm:px-3">🕊️ Hogares de Paz</TabsTrigger>}
              {(canSeeMapa() || canSeeCuerdas()) && <TabsTrigger value="territorio" className="text-xs sm:text-sm px-2 sm:px-3">🗺️ Territorio</TabsTrigger>}
              {canSeeRutas() && <TabsTrigger value="rutas" className="text-xs sm:text-sm px-2 sm:px-3">🧭 Rutas</TabsTrigger>}
              {canSeeAsistencia() && <TabsTrigger value="asistencia" className="text-xs sm:text-sm px-2 sm:px-3">✅ Asistencia</TabsTrigger>}
              {canSeeEventos() && <TabsTrigger value="eventos" className="text-xs sm:text-sm px-2 sm:px-3">📅 Eventos</TabsTrigger>}
              {canSeeHistorial() && <TabsTrigger value="historial" className="text-xs sm:text-sm px-2 sm:px-3">📋 Historial</TabsTrigger>}
              {canSeeValidador() && <TabsTrigger value="validator" className="text-xs sm:text-sm px-2 sm:px-3">🛡️ Validador</TabsTrigger>}
              {canSeePapelera() && <TabsTrigger value="papelera" className="text-xs sm:text-sm px-2 sm:px-3">🗑️ Papelera</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main content area */}
      <main className={`flex-1 p-2 sm:p-3 overflow-auto transition-opacity duration-150 ${isPending ? 'opacity-60' : 'opacity-100'}`}>
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default ChurchDetailsLayout;