import './setupReactGlobal';
import React, { Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SetupAccount from "./pages/SetupAccount";
import SharedRoutePage from "./pages/SharedRoutePage";
import WelcomeMessageAlert from "./components/WelcomeMessageAlert";
import { SessionProvider } from "./components/SessionProvider";
import { useSession } from "./hooks/use-session";
import { usePermissions } from "./lib/permissions";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLayout from "./components/layout/AdminLayout";
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import ChurchDetailsLayout from "./components/layout/ChurchDetailsLayout";
import PasswordChangeForm from "./components/auth/PasswordChangeForm";
import OnboardingForm from "./components/auth/OnboardingForm";
import { ThemeProvider } from "next-themes";
import UserLayout from "./components/layout/UserLayout";
import Profile from "./pages/Profile";

// Sends users to their appropriate landing page based on role.
// - Admin/general (canSeeAllAnalytics) → /admin/dashboard
// - Anyone else with a church_id → /admin/churches/<id>/overview (Resumen)
// - Anyone else without a church_id (rare/misconfigured) → /admin/churches list
const AdminRootRedirect = () => {
  const { canSeeAllAnalytics } = usePermissions();
  const { profile } = useSession();

  if (canSeeAllAnalytics()) return <Navigate to="dashboard" replace />;

  if (profile?.church_id) {
    return <Navigate to={`churches/${profile.church_id}/overview`} replace />;
  }
  return <Navigate to="churches" replace />;
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
  componentDidCatch(error: any, errorInfo: any) {
    // If it's a chunk load error, reload silently
    if (error?.message?.includes('Loading chunk') || error?.message?.includes('Failed to fetch') || error?.name === 'ChunkLoadError') {
      this.setState({ isRetrying: true });
      window.location.reload();
      return;
    }
    // For other errors, log to client_logs so they show up in /admin/logs
    try {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data }: any) => {
          supabase.from('client_logs').insert({
            level: 'error',
            action: 'react_error_boundary',
            error_message: error?.message || String(error),
            user_id: data?.user?.id || null,
            user_email: data?.user?.email || null,
            context: {
              page_url: window.location.href,
              user_agent: navigator.userAgent,
              stack: (error?.stack || '').slice(0, 5000),
              componentStack: (errorInfo?.componentStack || '').slice(0, 2000),
            },
          }).then(() => {});
        });
      }).catch(() => {});
    } catch { /* don't break further */ }
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

// Prefetch the most-used page chunks on app load so tab switches feel instant.
// These imports fire in the background — if they arrive before the user clicks
// the tab, React.lazy resolves immediately with no loading flash.
const prefetch = (fn: () => Promise<any>) => { fn().catch(() => {}); };
if (typeof window !== 'undefined') {
  // Delay prefetch slightly so it doesn't compete with initial page load
  setTimeout(() => {
    prefetch(() => import("./pages/admin/churches/[churchId]/SemilleroPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/CuerdasPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/CelulasPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/OverviewPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/ProcesosPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/TeamPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/HogaresDePazPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/MapaPage"));
    prefetch(() => import("./pages/admin/churches/[churchId]/HistorialPage"));
  }, 2000);
}

// Minimal loading indicator for tab transitions — prevents the flash-to-black
// that happens when Suspense fallback is null and the lazy chunk hasn't loaded yet.
const PageLoader = () => (
  <div className="p-6 space-y-3 animate-pulse">
    <div className="h-8 w-48 bg-muted rounded" />
    <div className="h-4 w-96 bg-muted/50 rounded" />
    <div className="h-64 w-full bg-muted/30 rounded-lg mt-4" />
  </div>
);
const AdminProfile = lazyRetry(() => import("./pages/admin/Profile"));
const ChurchesPage = lazyRetry(() => import("./pages/admin/ChurchesPage"));
const ChurchOverviewPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/OverviewPage"));
const CuerdasPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/CuerdasPage"));
const MapaPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/MapaPage"));
const ChurchTeamPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/TeamPage"));
const SemilleroPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/SemilleroPage"));
const CelulasPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/CelulasPage"));
const ProcesosPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/ProcesosPage"));
const HistorialPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/HistorialPage"));
const PapeleraPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/PapeleraPage"));
const ValidatorPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/ValidatorPage"));
const HogaresDePazPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/HogaresDePazPage"));
const AsistenciaPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/AsistenciaPage"));
const EventosPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/EventosPage"));
const RutasPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/RutasPage"));
const RouteEditorPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/RouteEditorPage"));
const MapPickerPage = lazyRetry(() => import("./pages/admin/churches/[churchId]/MapPickerPage"));
const LoginManagementPage = lazyRetry(() => import("./pages/admin/LoginManagementPage"));
const LogsPage = lazyRetry(() => import("./pages/admin/LogsPage"));
const ZonasPage = lazyRetry(() => import("./pages/admin/ZonasPage"));
const Messages = lazyRetry(() => import("./pages/Messages"));
const PermissionsDashboard = lazyRetry(() => import("./pages/admin/PermissionsDashboard"));
const InfoPage = lazyRetry(() => import("./pages/admin/InfoPage"));
const NotificationsPage = lazyRetry(() => import("./pages/admin/NotificationsPage"));
const TemplatesPage = lazyRetry(() => import("./pages/admin/TemplatesPage"));
const CsvColumnMergerPage = lazyRetry(() => import("./pages/admin/CsvColumnMergerPage"));
const CsvSandboxPage = lazyRetry(() => import("./pages/admin/CsvSandboxPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on every tab focus - that was hammering the API and making
      // the UI feel frozen for 1-2 seconds every time the user clicked back
      // into the tab. Mutations explicitly invalidate the queries that need
      // to update, and individual hot queries can opt back in via
      // refetchOnWindowFocus: true when needed.
      refetchOnWindowFocus: false,
      // 60s stale time as a sensible default. Things like zonas/cuerdas/team
      // barely ever change so this is plenty. Hot queries that need fresher
      // data (like contact lists) can override per-query.
      staleTime: 60_000,
      // Don't refetch on remount within the staleTime window. Prevents the
      // 'every tab navigation feels slow' bug.
      refetchOnMount: false,
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
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup-account" element={<SetupAccount />} />
      <Route path="/r/:token" element={<SharedRoutePage />} />

      {/* Root route: redirect to /admin so the AdminRootRedirect can pick the
          right destination based on role. The old <Index /> 'Welcome' page was
          deleted - it was a dead end that forced users to click before getting
          into the actual app. */}
      <Route path="/" element={
        <PrivateRoute>
          <UserLayout>
            <Outlet />
          </UserLayout>
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="/admin" replace />} />
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
        <Route path="csv-merger" element={<CsvColumnMergerPage />} />
        <Route path="csv-sandbox" element={
          <AdminOnlyRoute>
            <CsvSandboxPage />
          </AdminOnlyRoute>
        } />
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
          <Route path="team" element={<ChurchTeamPage />} />
          <Route path="cuerdas" element={<CuerdasPage />} />
          <Route path="mapa" element={<MapaPage />} />
          <Route path="pool" element={<SemilleroPage />} />
          <Route path="celulas" element={<CelulasPage />} />
          <Route path="procesos" element={<ProcesosPage />} />
          <Route path="historial" element={<HistorialPage />} />
          <Route path="papelera" element={<PapeleraPage />} />
          <Route path="validator" element={<ValidatorPage />} />
          <Route path="hogares" element={<HogaresDePazPage />} />
          <Route path="asistencia" element={<AsistenciaPage />} />
          <Route path="eventos" element={<EventosPage />} />
          <Route path="rutas" element={<RutasPage />} />
          <Route path="rutas/:projectId" element={<RouteEditorPage />} />
          <Route path="rutas/:projectId/mapa" element={<MapPickerPage />} />
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
      <SpeedInsights />
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <PasswordSetupGate>
              <div className="h-screen flex flex-col">
                <main className="flex-grow">
                  <AppRoutes />
                </main>
                <WelcomeMessageAlert />
              </div>
            </PasswordSetupGate>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const PasswordSetupGate = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useSession();

  // If still loading session/profile, don't flash anything
  if (loading) return null;

  // Don't gate the dedicated setup page or public shared routes — they handle
  // their own flow and don't need auth.
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/setup-account' || path.startsWith('/r/')) {
      return <>{children}</>;
    }
  }

  // No session = not logged in, let the login page handle it
  if (!session) return <>{children}</>;

  // Session exists but profile hasn't loaded yet — wait, don't let them through
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  // Profile loaded but onboarding not completed — force setup
  if (!profile.profile_completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 14px rgba(255,194,51,0.6))' }}>
              <img src="/logo.png" alt="MJA" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold">MJA CRM</h1>
            <p className="text-muted-foreground text-sm mt-1">Bienvenido/a — completá tu cuenta para continuar.</p>
          </div>
          <OnboardingForm onSuccess={() => {
            window.location.href = '/';
          }} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default App;
