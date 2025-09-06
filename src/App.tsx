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
import InitialProfileSetup from "./pages/InitialProfileSetup"; // Nueva importación
import PasswordSetup from "./pages/PasswordSetup"; // Nueva importación

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
      <Route 
        path="/" 
        element={<PrivateRoute />} 
      />
      <Route 
        path="/profile" 
        element={session ? <Profile /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/initial-profile-setup" 
        element={session ? <InitialProfileSetup /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/password-setup" 
        element={session ? <PasswordSetup /> : <Navigate to="/login" replace />} 
      />
      
      {/* Admin Routes */}
      <Route 
        path="/admin/*"
        element={
          <AdminRoute>
            <AdminLayout>
              <Routes>
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="manage-team" element={<ManageTeam />} />
                <Route path="profile" element={<AdminProfile />} />
                <Route path="database" element={<DatabasePage />} />
                <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
                <Route index element={<Navigate to="dashboard" replace />} />
              </Routes>
            </AdminLayout>
          </AdminRoute>
        }
      />

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
          {/* Forced dark mode */}
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