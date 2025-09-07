"use client";

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import ChurchSidebar from './ChurchSidebar';
import { Outlet } from 'react-router-dom'; // Import Outlet

interface ChurchDetailsLayoutProps {
  children?: React.ReactNode; // Children are now optional as Outlet will render them
}

const ChurchDetailsLayout = ({ children }: ChurchDetailsLayoutProps) => {
  const { churchId } = useParams<{ churchId: string }>();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!churchId) {
    return <div className="p-6 text-red-500">Error: No se encontró el ID de la iglesia.</div>;
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
          {children || <Outlet />} {/* Render children if provided, otherwise Outlet */}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default ChurchDetailsLayout;