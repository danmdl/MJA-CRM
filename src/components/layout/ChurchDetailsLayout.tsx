"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import ChurchSidebar from './ChurchSidebar';
import { Outlet } from 'react-router-dom';
import { useSession } from '@/hooks/use-session'; // Import useSession
import { showError } from '@/utils/toast';

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode;
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const { profile, loading: sessionLoading } = useSession(); // Get user profile and session loading state
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (sessionLoading) return; // Wait for session and profile to load

    if (!churchId) {
      showError('Error: No se encontró el ID de la iglesia.');
      navigate('/admin/churches', { replace: true });
      return;
    }

    const isAdminOrGeneral = profile?.role === 'admin' || profile?.role === 'general';
    const isAssignedToChurch = profile?.church_id === churchId;

    if (!isAdminOrGeneral && !isAssignedToChurch) {
      showError('No tienes permiso para acceder a los detalles de esta iglesia.');
      navigate('/admin/churches', { replace: true });
    } else {
      setAccessChecked(true);
    }
  }, [churchId, profile, sessionLoading, navigate]);

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
        <ChurchSidebar isCollapsed={isSidebarCollapsed} churchId={churchId} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={85}>
        <main className="flex-1 p-6 overflow-auto">
          {children || <Outlet />}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default ChurchDetailsLayout;