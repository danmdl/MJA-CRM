import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Outlet } from 'react-router-dom'; // Import Outlet
import { useSession } from '@/hooks/use-session'; // Import useSession to pass to Sidebar

interface AdminLayoutProps {
  // children: React.ReactNode; // No longer needed as Outlet will render children
}

const AdminLayout = () => { // No longer takes children prop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { session } = useSession(); // Get session to pass to Sidebar

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-screen w-full"
      onLayout={(sizes: number[]) => {
        // Check if the sidebar panel is at its minimum size (collapsed)
        setIsSidebarCollapsed(sizes[0] < 10); // Assuming minSize for collapsed is < 10%
      }}
    >
      <ResizablePanel
        defaultSize={15}
        minSize={4} // Minimum size for collapsed state (e.g., 4% for icons only)
        maxSize={25}
        collapsible={true}
        onCollapse={() => setIsSidebarCollapsed(true)}
        onExpand={() => setIsSidebarCollapsed(false)}
        className="min-w-[60px]" // Ensure a minimum pixel width even when collapsed
      >
        <Sidebar isCollapsed={isSidebarCollapsed} userSession={session} /> {/* Pass session */}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={85}>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet /> {/* This is where the matched child route will be rendered */}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default AdminLayout;