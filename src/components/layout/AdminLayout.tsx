import React from 'react';
import TopNav from './TopNav';
import { Outlet } from 'react-router-dom'; // Import Outlet

interface AdminLayoutProps {
  children?: React.ReactNode; // Children are optional as Outlet will render them
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <div className="flex flex-col h-full w-full">
      <TopNav />
      <main className="flex-1 p-6 overflow-auto">
        {children || <Outlet />} {/* Render children if provided, otherwise Outlet */}
      </main>
    </div>
  );
};

export default AdminLayout;
