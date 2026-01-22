import './setupReactGlobal';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLayout from "./components/layout/AdminLayout";
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import AdminProfile from "./pages/admin/Profile";
import CsvDeduplicatorPage from "./pages/admin/CsvDeduplicatorPage";
import ChurchesPage from "./pages/admin/ChurchesPage";
import ChurchDetailsLayout from "./components/layout/ChurchDetailsLayout";
import ChurchOverviewPage from "./pages/admin/churches/[churchId]/OverviewPage";
import CellsPage from "./pages/admin/churches/[churchId]/CellsPage";
import ChurchDatabasePage from "./pages/admin/churches/[churchId]/DatabasePage";
import ChurchTeamPage from "./pages/admin/churches/[churchId]/TeamPage";
import { ThemeProvider } from "next-themes";
import UserLayout from "./components/layout/UserLayout";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import PermissionsDashboard from "./pages/admin/PermissionsDashboard";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { loading } = useSession();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* User-specific routes, wrapped by PrivateRoute and UserLayout */}
      <Route path="/" element={
        <PrivateRoute>
          <UserLayout>
            <Outlet />
          </UserLayout>
        </PrivateRoute>
      }>
        <Route index element={<Index />} />
        <Route path="profile" element={<Profile />} />
        <Route path="messages" element={<Messages />} />
        {/* CSV Deduplicator is now accessible to all authenticated users */}
        <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
      </Route>
      
      {/* Admin Routes (accessible by admin, general, and specific church roles for certain paths) */}
      <Route path="/admin" element={
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="churches" element={<ChurchesPage />} />
        <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        {/* REMOVED: LoginManagementPage */}
        <Route path="profile" element={<AdminProfile />} />
        <Route path="messages" element={<Messages />} />
        
        {/* Permissions Dashboard - accessible to all admin users */}
        <Route path="permissions" element={<PermissionsDashboard />} />
        
        {/* Nested routes for specific church details */}
        <Route path="churches/:churchId" element={<ChurchDetailsLayout><Outlet /></ChurchDetailsLayout>}>
          <Route path="overview" element={<ChurchOverviewPage />} />
          <Route path="database" element={<ChurchDatabasePage />} />
          <Route path="team" element={<ChurchTeamPage />} />
          <Route path="cells" element={<CellsPage />} />
          <Route index element={<Navigate to="overview" replace />} />
        </Route>
      </Route>
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <div className="h-screen flex flex-col">
              <main className="flex-grow">
                <AppRoutes />
              </main>
            </div>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;