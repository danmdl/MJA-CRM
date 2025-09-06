"use client";

import React, { useState } from 'react'; // Explicitly importing React
import Sidebar from './Sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useSession } from '@/hooks/use-session';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface UserLayoutProps {
  children: React.ReactNode;
}

const fetchUserRole = async (userId: string | undefined): Promise<string> => {
  if (!userId) return 'user'; // Default role if no user ID

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user role for UserLayout:', error);
    showError('Error al cargar el rol del usuario.');
    return 'user'; // Default to 'user' on error
  }
  return data?.role || 'user';
};

const UserLayout = ({ children }: UserLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { session, loading: sessionLoading } = useSession();

  const { data: userRole = 'user', isLoading: roleLoading } = useQuery<string>({
    queryKey: ['userRole', session?.user?.id],
    queryFn: () => fetchUserRole(session?.user?.id),
    enabled: !!session?.user?.id && !sessionLoading,
  });

  if (sessionLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando diseño de usuario...</div>
      </div>
    );
  }

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
        <Sidebar isCollapsed={isSidebarCollapsed} userRole={userRole} basePath="/" />
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

export default UserLayout;