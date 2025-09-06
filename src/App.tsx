import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import { MadeWithDyad } from "./components/made-with-dyad";
import AdminDashboard from "./pages/admin/Dashboard";
import ManageTeam from "./pages/admin/ManageTeam";
import AdminLayout from "./components/layout/AdminLayout";
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import AdminProfile from "./pages/admin/Profile";
import DatabasePage from "./pages/admin/Database";
import CsvDeduplicatorPage from "./pages/admin/CsvDeduplicatorPage";
import { ThemeProvider } from "next-themes";
import InitialProfileSetup from "./pages/InitialProfileSetup";
import PasswordSetup from "./pages/PasswordSetup";
import UserLayout from "./components/layout/UserLayout";
import Index from "./pages/Index";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { session, loading } = useSession();

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
      
      {/* Routes for initial profile and password setup (no layout) */}
      <Route 
        path="/initial-profile-setup" 
        element={session ? <InitialProfileSetup /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/password-setup" 
        element={session ? <PasswordSetup /> : <Navigate to="/login" replace />} 
      />

      {/* Private routes for authenticated users (non-admin) */}
      <Route 
        path="/" 
        element={<PrivateRoute />} // PrivateRoute handles auth and redirects to onboarding if needed
      >
        <Route element={<UserLayout />}> {/* UserLayout provides the sidebar for non-admin users */}
          <Route index element={<Index />} />
          <Route path="profile" element={<Profile />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        </Route>
      </Route>
      
      {/* Admin Routes */}
      <Route 
        path="/admin" // Parent route for admin section
        element={
          <AdminRoute>
            <AdminLayout /> {/* AdminLayout provides the sidebar for admin users */}
          </AdminRoute>
        }
      >
        {/* Child routes for admin section, rendered within AdminLayout's <Outlet /> */}
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="manage-team" element={<ManageTeam />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        <Route index element={<Navigate to="dashboard" replace />} /> {/* Default admin route */}
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
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <div className="min-h-screen flex flex-col">
              <main className="flex-grow">
                <AppRoutes />
              </main>
              <MadeWithDyad />
            </div>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;