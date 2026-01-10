"use client";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/use-session";
import { showError } from "@/utils/toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import ChurchSidebar from './ChurchSidebar';

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
      
      {/* Main content area with nested sidebar */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
        onLayout={(sizes: number[]) => {
          setIsSidebarCollapsed(sizes[0] < 10);
        }}
      >
        <ResizablePanel
          defaultSize={15}
          minSize={4}
          maxSize={25}
          collapsible={true}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
          className="min-w-[60px] h-full"
        >
          <ChurchSidebar isCollapsed={isSidebarCollapsed} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={85}>
          <main className="flex-1 p-6 overflow-auto">
            {children || <Outlet />}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ChurchDetailsLayout;