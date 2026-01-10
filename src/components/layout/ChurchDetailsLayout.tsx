"use client";

import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { showError } from "@/utils/toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'; // Import Resizable components

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isChurchNavCollapsed, setIsChurchNavCollapsed] = useState(false); // State for the inner sidebar collapse

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
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full w-full"
      onLayout={(sizes: number[]) => {
        setIsChurchNavCollapsed(sizes[0] < 10);
      }}
    >
      {/* Second Column: Church-specific Navigation (Sidebar-like) */}
      <ResizablePanel
        defaultSize={15} // Adjust size as needed for the second sidebar
        minSize={4}
        maxSize={25}
        collapsible={true}
        onCollapse={() => setIsChurchNavCollapsed(true)}
        onExpand={() => setIsChurchNavCollapsed(false)}
        className="min-w-[60px] h-full flex flex-col bg-background border-r" // Added flex-col for vertical layout
      >
        {/* Church Name Header */}
        <div className="p-4 border-b">
          {nameLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <h2 className="text-xl font-bold tracking-tight break-words whitespace-normal">
              {!isChurchNavCollapsed && (churchData?.name || "Iglesia")}
            </h2>
          )}
        </div>

        {/* Tabs for Church Navigation */}
        <nav className="flex flex-col p-2 flex-grow space-y-1"> {/* Use nav for semantic structure */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => navigate(`/admin/churches/${churchId}/${val}`)}
            className="w-full"
            orientation="vertical" // Make tabs vertical
          >
            <TabsList className="flex flex-col h-auto p-0 bg-transparent"> {/* Style TabsList for vertical display */}
              <TabsTrigger value="overview" className="justify-start data-[state=active]:bg-muted data-[state=active]:text-primary">
                Resumen
              </TabsTrigger>
              <TabsTrigger value="database" className="justify-start data-[state=active]:bg-muted data-[state=active]:text-primary">
                Base de Datos
              </TabsTrigger>
              <TabsTrigger value="team" className="justify-start data-[state=active]:bg-muted data-[state=active]:text-primary">
                Equipo de Células
              </TabsTrigger>
              <TabsTrigger value="cells" className="justify-start data-[state=active]:bg-muted data-[state=active]:text-primary">
                Células
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Third Column: Main Content Area */}
      <ResizablePanel defaultSize={85}> {/* This panel will contain the actual page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children || <Outlet />}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default ChurchDetailsLayout;