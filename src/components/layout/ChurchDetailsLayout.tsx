"use client";

import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { showError } from "@/utils/toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from '@/utils/logger'; // Import the logger utility

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
      logger.log('[ChurchDetailsLayout] Session loading, skipping access check for now.');
      return;
    }

    logger.log('[ChurchDetailsLayout] Starting access check for church details.', {
      userProfile: profile,
      paramChurchId: churchId,
      currentPath: location.pathname
    });

    if (!churchId) {
      logger.error('[ChurchDetailsLayout] No churchId found in params, redirecting to /admin/churches.');
      showError("Error: No se encontró el ID de la iglesia.");
      navigate("/admin/churches", { replace: true });
      return;
    }

    const isAdminOrGeneral = profile?.role === "admin" || profile?.role === "general";
    const isAssignedToChurch = profile?.church_id === churchId;

    logger.log('[ChurchDetailsLayout] Authorization check results:', {
      isAdminOrGeneral,
      isAssignedToChurch,
      profileChurchId: profile?.church_id,
      paramChurchId: churchId
    });

    if (!isAdminOrGeneral && !isAssignedToChurch) {
      logger.warn('[ChurchDetailsLayout] User not authorized for this church, redirecting to /admin/churches.');
      showError("No tienes permiso para acceder a los detalles de esta iglesia.");
      navigate("/admin/churches", { replace: true });
    } else {
      logger.log('[ChurchDetailsLayout] User authorized for this church.');
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
        logger.error('[ChurchDetailsLayout] Error fetching church name:', error);
        return { name: "" };
      }
      logger.log('[ChurchDetailsLayout] Church name fetched successfully.', { name: data.name });
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
  logger.log('[ChurchDetailsLayout] Active tab:', activeTab);

  if (!accessChecked || sessionLoading) {
    logger.log('[ChurchDetailsLayout] Access not yet checked or session loading, showing loading state.');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Verificando acceso a la iglesia...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <div className="p-4 border-b">
        {nameLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <h2 className="text-xl font-bold tracking-tight">{churchData?.name || "Iglesia"}</h2>
        )}
      </div>

      <div className="p-4">
        <Tabs
          value={activeTab}
          onValueChange={(val) => navigate(`/admin/churches/${churchId}/${val}`)}
          className="w-full"
        >
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="database">Base de Datos</TabsTrigger>
            <TabsTrigger value="team">Equipo de Células</TabsTrigger>
            <TabsTrigger value="cells">Células</TabsTrigger>
          </TabsList>
        </Tabs>

        <main className="flex-1 overflow-auto">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default ChurchDetailsLayout;