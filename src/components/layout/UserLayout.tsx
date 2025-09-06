import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useSession } from '@/hooks/use-session';
import { Outlet } from 'react-router-dom'; // Importar Outlet

const UserLayout = () => { // Ya no necesita el prop 'children'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { session } = useSession();

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-screen w-full"
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
        className="min-w-[60px]"
      >
        <Sidebar isCollapsed={isSidebarCollapsed} userSession={session} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={85}>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet /> {/* Renderizar Outlet para las rutas anidadas */}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default UserLayout;