import './setupReactGlobal';
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import { usePermissions } from "./lib/permissions";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLayout from "./components/layout/AdminLayout";
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import ChurchDetailsLayout from "./components/layout/ChurchDetailsLayout";
import PasswordChangeForm from "./components/auth/PasswordChangeForm";
import { ThemeProvider } from "next-themes";
import UserLayout from "./components/layout/UserLayout";
import Index from "./pages/Index";
import Profile from "./pages/Profile";

// Sends users to their appropriate landing page based on role.
// Admin/general → /admin/dashboard. Everyone else → /admin/churches.
const AdminRootRedirect = () => {
  const { canSeeAllAnalytics } = usePermissions();
  return <Navigate to={canSeeAllAnalytics() ? 'dashboard' : 'churches'} replace />;
};

// Guards the dashboard route - only admins/generals can access.
const DashboardGuard = ({ children }: { children: React.ReactNode }) => {
  const { canSeeAllAnalytics } = usePermissions();
  if (!canSeeAllAnalytics()) return <Navigate to="/admin/churches" replace />;
  return <>{children}</>;
};

// Error boundary: catches chunk load failures and auto-reloads
class ChunkErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; isRetrying: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false, isRetrying: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    // If it's a chunk load error, reload silently
    if (error?.message?.includes('Loading chunk') || error?.message?.includes('Failed to fetch') || error?.name === 'ChunkLoadError') {
      this.setState({ isRetrying: true });
      window.location.reload();
      return;
    }
  }
  render() {
    if (this.state.hasError) {
      // While retrying (chunk reload), show nothing — the page is about to reload
      if (this.state.isRetrying) return null;
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">Error al cargar la página.</p>
            <button className="text-primary hover:underline text-sm" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy import with retry — returns a promise that resolves after retry, never calls reload()
const lazyRetry = (fn: () => Promise<any>) => React.lazy(() =>
  fn().catch(() => new Promise<any>((resolve) => {
    // Wait a beat then retry once (handles stale chunks after deploy)
    setTimeout(() => resolve(fn()), 500);
  }))
);

// Lazy-loaded pages (heavy components, loaded on demand)
const AdminProfile = lazyRetry(() => import("./pages/admin/Profile"));
const ChurchesPage = lazyRetry(() => import("./pages/admin/ChurchesPage"));
const ChurchOverviewPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/OverviewPage"));
const CuerdasPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/CuerdasPage"));
const MapaPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/MapaPage"));
const ChurchDatabasePage = lazyRetry(() => import("./pages/admin/churches/[churchId]/DatabasePage"));
const ChurchTeamPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/TeamPage"));
const SemilleroPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/SemilleroPage"));
const CelulasPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/CelulasPage"));
const HistorialPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/HistorialPage"));
const PapeleraPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/PapeleraPage"));
const ValidatorPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/ValidatorPage"));
const HogaresDePazPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/HogaresDePazPage"));
const LoginManagementPage = lazyRetry(() => import("./pages/admin/LoginManagementPage"));
const LogsPage = lazyRetry(() => import("./pages/admin/LogsPage"));
const ZonasPage = lazyRetry(() => import("./pages/admin/ZonasPage"));
const Messages = lazyRetry(() => import("./pages/Messages"));
const PermissionsDashboard = lazyRetry(() => import("./pages/admin/PermissionsDashboard"));
const InfoPage = lazyRetry(() => import("./pages/admin/InfoPage"));
const NotificationsPage = lazyRetry(() => import("./pages/admin/NotificationsPage"));
const TemplatesPage = lazyRetry(() => import("./pages/admin/TemplatesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,  // Prevents re-fetching (and re-rendering) when user switches back to the tab
      staleTime: 30_000,            // Data stays fresh for 30s
    },
  },
});

// Guard component: only admin can access permissions page
const AdminOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useSession();
  const { canAccessPermissions } = usePermissions();
  if (profile && !canAccessPermissions()) {
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
    <ChunkErrorBoundary>
    <Suspense fallback={null}>
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
        <Route index element={<AdminRootRedirect />} />
        <Route path="dashboard" element={<DashboardGuard><AdminDashboard /></DashboardGuard>} />
        <Route path="churches" element={<ChurchesPage />} />
        <Route path="login-management" element={<LoginManagementPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="zonas" element={<ZonasPage />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="messages" element={<Messages />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="info" element={<InfoPage />} />
        <Route path="notifications" element={<NotificationsPage />} />

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
          <Route path="cuerdas" element={<CuerdasPage />} />
          <Route path="mapa" element={<MapaPage />} />
          <Route path="pool" element={<SemilleroPage />} />
          <Route path="celulas" element={<CelulasPage />} />
          <Route path="historial" element={<HistorialPage />} />
          <Route path="papelera" element={<PapeleraPage />} />
          <Route path="validator" element={<ValidatorPage />} />
          <Route path="hogares" element={<HogaresDePazPage />} />
          <Route index element={<Navigate to="overview" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </ChunkErrorBoundary>
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
            <div className="w-14 h-14 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))' }}>
              <img src="/logo.png" alt="MJA" className="w-full h-full object-contain" />
            </div>
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
