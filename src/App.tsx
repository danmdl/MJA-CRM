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
import ChurchesPage from "./pages/admin/ChurchesPage";
import ChurchDetailsLayout from "./components/layout/ChurchDetailsLayout";
import ChurchOverviewPage from "./pages/admin/churches/[churchId]/OverviewPage";
import CellsPage from "./pages/admin/churches/[churchId]/CellsPage";
import ChurchDatabasePage from "./pages/admin/churches/[churchId]/DatabasePage";
import ChurchTeamPage from "./pages/admin/churches/[churchId]/TeamPage";
import LoginManagementPage from "./pages/admin/LoginManagementPage";
import { ThemeProvider } from "next-themes";
import UserLayout from "./components/layout/UserLayout";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import PermissionsDashboard from "./pages/admin/PermissionsDashboard";
import PasswordChangeForm from "./components/auth/PasswordChangeForm";

const queryClient = new QueryClient();

// Guard component: only admin can access permissions page
const AdminOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useSession();
  if (profile && profile.role !== 'admin') {
    return <Navigate to="/admin/churches" replace />;
  }
  return <>{children}</>;
};

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
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="churches" element={<ChurchesPage />} />
        <Route path="login-management" element={<LoginManagementPage />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="messages" element={<Messages />} />

        {/* Permissions Dashboard - ADMIN ONLY */}
        <Route path="permissions" element={
          <AdminOnlyRoute>
            <PermissionsDashboard />
          </AdminOnlyRoute>
        } />

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
            <PasswordSetupGate>
              <div className="h-screen flex flex-col">
                <main className="flex-grow">
                  <AppRoutes />
                </main>
              </div>
            </PasswordSetupGate>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const PasswordSetupGate = ({ children }: { children: React.ReactNode }) => {
  const { needsPasswordSetup, clearPasswordSetup, session } = useSession();

  if (needsPasswordSetup && session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-2xl mx-auto mb-3">⛪</div>
            <h1 className="text-2xl font-bold">MJA CRM</h1>
            <p className="text-muted-foreground text-sm mt-1">Bienvenido/a. Configura tu acceso.</p>
          </div>
          <PasswordChangeForm isFirstSetup onSuccess={clearPasswordSetup} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default App;
