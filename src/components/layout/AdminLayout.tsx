"use client";

import React, { useState } from 'react';
import TopNav from './TopNav';
import Sidebar from './Sidebar'; // Import the main Sidebar
import { Outlet } from 'react-router-dom';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

const AdminLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-full w-full">
      <TopNav />
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
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={85}>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default AdminLayout;