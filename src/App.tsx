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
import AdminRoute from "./components/auth/AdminRoute";
import PrivateRoute from "./components/auth/PrivateRoute";
import AdminProfile from "./pages/admin/Profile";
import DatabasePage from "./pages/admin/Database";
import CsvDeduplicatorPage from "./pages/admin/CsvDeduplicatorPage";
import { ThemeProvider } from "next-themes";
import InitialProfileSetup from "./pages/InitialProfileSetup";
import PasswordSetup from "./pages/PasswordSetup";
import UserLayout from "./components/layout/UserLayout";
import AdminLayout from "./components/layout/AdminLayout";
import Index from "./pages/Index";
import { useEffect, useState } from "react";
import { supabase } from "./integrations/supabase/client";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { session, loading: sessionLoading } = useSession();
  const [profileComplete, setProfileComplete] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (sessionLoading) return;

      if (!session) {
        setLoadingOnboarding(false);
        return;
      }

      // Check profile completion
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.user.id)
        .single();

      const isProfileComplete = profileData && profileData.first_name && profileData.last_name;
      setProfileComplete(!!isProfileComplete);

      // Check if password needs to be set (only if last_sign_in_at is null, implying first login after invite)
      const isPasswordSet = !!session.user.last_sign_in_at;
      setPasswordSet(isPasswordSet);
      
      setLoadingOnboarding(false);
    };

    checkOnboardingStatus();
  }, [session, sessionLoading]);

  if (sessionLoading || loadingOnboarding) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div>Cargando...</div>
        </div>
    );
  }

  // --- Onboarding Redirects (handled at the top-level AppRoutes) ---
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profileComplete) {
    return <Navigate to="/initial-profile-setup" replace />;
  }

  if (!passwordSet) {
    return <Navigate to="/password-setup" replace />;
  }
  // --- End Onboarding Redirects ---

  return (
    <Routes>
      {/* Public routes and onboarding steps */}
      <Route path="/login" element={<Login />} />
      <Route path="/initial-profile-setup" element={<InitialProfileSetup />} />
      <Route path="/password-setup" element={<PasswordSetup />} />

      {/* Protected routes for regular users */}
      {/* PrivateRoute acts as a role guard (non-admin) */}
      <Route element={<PrivateRoute />}>
        {/* UserLayout provides the common layout */}
        <Route element={<UserLayout />}>
          <Route index element={<Index />} />
          <Route path="profile" element={<Profile />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        </Route>
      </Route>

      {/* Protected routes for admin users */}
      {/* AdminRoute acts as a role guard (admin) */}
      <Route path="/admin" element={<AdminRoute />}>
        {/* AdminLayout provides the common layout */}
        <Route element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="manage-team" element={<ManageTeam />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
          <Route index element={<Navigate to="dashboard" replace />} />
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