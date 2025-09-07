import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"; // Import Outlet
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import AdminDashboard from "./pages/admin/Dashboard";
import ManageTeam from "./pages/admin/ManageTeam";
import AdminLayout from "./components/layout/AdminLayout";
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import AdminProfile from "./pages/admin/Profile";
import DatabasePage from "./pages/admin/Database";
import CsvDeduplicatorPage from "./pages/admin/CsvDeduplicatorPage";
import ChurchesPage from "./pages/admin/ChurchesPage";
import ChurchDetailsLayout from "./components/layout/ChurchDetailsLayout";
import ChurchOverviewPage from "./pages/admin/churches/[churchId]/OverviewPage";
import ChurchDatabasePage from "./pages/admin/churches/[churchId]/DatabasePage";
import ChurchTeamPage from "./pages/admin/churches/[churchId]/TeamPage";
import { ThemeProvider } from "next-themes";
import UserLayout from "./components/layout/UserLayout"; // Import UserLayout
import Index from "./pages/Index"; // Import Index
import Profile from "./pages/Profile"; // Import Profile

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
      <Route path="/" element={<PrivateRoute><UserLayout><Outlet /></UserLayout></PrivateRoute>}>
        <Route index element={<Index />} />
        <Route path="profile" element={<Profile />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
      </Route>
      
      {/* Admin Routes */}
      <Route 
        path="/admin" // Base path for admin routes
        element={
          <AdminRoute>
            <AdminLayout>
              <Outlet /> {/* Outlet for nested admin routes */}
            </AdminLayout>
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="churches" element={<ChurchesPage />} />
        <Route path="manage-team" element={<ManageTeam />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        
        {/* Nested routes for specific church details */}
        <Route path="churches/:churchId" element={<ChurchDetailsLayout><Outlet /></ChurchDetailsLayout>}>
          <Route path="overview" element={<ChurchOverviewPage />} />
          <Route path="database" element={<ChurchDatabasePage />} />
          <Route path="team" element={<ChurchTeamPage />} />
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