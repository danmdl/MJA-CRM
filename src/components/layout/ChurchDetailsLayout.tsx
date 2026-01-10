"use client";

import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;

    if (!churchId) {
      showError("Error: No se encontró el ID de la iglesia.");
      navigate("/admin/churches", { replace: true });
      return;
    }

    const isAdminOrGeneral = profile?.role === "admin" || profile?.role === "general";
    const isAssignedToChurch = profile?.church_id === churchId;

    if (!isAdminOrGeneral && !isAssignedToChurch) {
      showError("No tienes permiso para acceder a los detalles de esta iglesia.");
      navigate("/admin/churches", { replace: true });
      return;
    }

    setAccessChecked(true);
  }, [churchId, profile, sessionLoading, navigate]);

  const { data: churchData, isLoading: nameLoading } = useQuery({
    queryKey: ["churchName", churchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churches")
        .select("name")
        .eq("id", churchId)
        .single();

      if (error) return { name: "" };
      return data as { name: string };
    },
    enabled: !!churchId,
  });

  const activeTab = (() => {
    const p = location.pathname;
    if (p.endsWith("/overview")) return "overview";
    if (p.endsWith("/database")) return "database";
    if (p.endsWith("/team")) return "team";
    if (p.endsWith("/cells")) return "cells";
    return "overview";
  })();

  if (!accessChecked || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso a la iglesia...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            {nameLoading ? (
              <Skeleton className="h-6 w-56" />
            ) : (
              <h2 className="text-xl font-bold tracking-tight">
                {churchData?.name || "Iglesia"}
              </h2>
            )}
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(val) => navigate(`/admin/churches/${churchId}/${val}`)}
            className="w-full"
          >
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Resumen</TabsTrigger>
              <TabsTrigger value="database">Base de Datos</TabsTrigger>
              <TabsTrigger value="team">Equipo</TabsTrigger>
              <TabsTrigger value="cells">Células</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="flex-1 p-6 overflow-auto">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default ChurchDetailsLayout;