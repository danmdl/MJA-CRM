import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
        <Sidebar isCollapsed={isSidebarCollapsed} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={85}>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default AdminLayout;