import React, { useState } from 'react';
import UserSidebar from './UserSidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Outlet } from 'react-router-dom'; // Import Outlet

interface UserLayoutProps {
  children?: React.ReactNode; // Children are now optional as Outlet will render them
}

const UserLayout = ({ children }: UserLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
        <UserSidebar isCollapsed={isSidebarCollapsed} />
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

export default UserLayout;