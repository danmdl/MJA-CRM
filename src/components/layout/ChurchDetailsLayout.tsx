"use client";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
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

    const isAdminOrGeneral = profile?.role === "admin" || profile?.role === "general";
    const isAssignedToChurch = profile?.church_id === churchId;

    if (!isAdminOrGeneral && !isAssignedToChurch) {
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
      {/* Church name header */}
      <div className="border-b bg-background p-4">
        <h2 className="text-2xl font-bold tracking-tight">
          {nameLoading ? <Skeleton className="h-8 w-64" /> : churchData?.name || "Iglesia"}
        </h2>
      </div>
      
      {/* Top tabs navigation */}
      <div className="border-b bg-background">
        <Tabs 
          value={activeTab} 
          onValueChange={(val) => navigate(`/admin/churches/${churchId}/${val}`)}
          className="w-full px-4"
        >
          <TabsList className="mb-0">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="database">Base de Datos</TabsTrigger>
            <TabsTrigger value="team">Equipo</TabsTrigger>
            <TabsTrigger value="cells">Células</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* Main content area */}
      <main className="flex-1 p-6 overflow-auto"> {/* Added p-6 here */}
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default ChurchDetailsLayout;