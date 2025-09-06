import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./hooks/use-session";
import { supabase } from "./integrations/supabase/client";

// Import all pages and layouts
import Login from "./pages/Login";
import InitialProfileSetup from "./pages/InitialProfileSetup";
import PasswordSetup from "./pages/PasswordSetup";
import PrivateRoute from "./components/auth/PrivateRoute";
import UserLayout from "./components/layout/UserLayout";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import DatabasePage from "./pages/admin/Database";
import CsvDeduplicatorPage from "./pages/admin/CsvDeduplicatorPage";
import AdminRoute from "./components/auth/AdminRoute";
import AdminLayout from "./components/layout/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import ManageTeam from "./pages/admin/ManageTeam";
import AdminProfile from "./pages/admin/Profile";
import NotFound from "./pages/NotFound";

const AppContent = () => {
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

  // --- Onboarding Redirects ---
  // If not authenticated, go to login
  if (!session) {
    return <Routes><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  }

  // If authenticated but profile not complete, go to initial profile setup
  if (!profileComplete) {
    return (
      <Routes>
        <Route path="/initial-profile-setup" element={<InitialProfileSetup />} />
        <Route path="*" element={<Navigate to="/initial-profile-setup" replace />} />
      </Routes>
    );
  }

  // If authenticated, profile complete, but password not set, go to password setup
  if (!passwordSet) {
    return (
      <Routes>
        <Route path="/password-setup" element={<PasswordSetup />} />
        <Route path="*" element={<Navigate to="/password-setup" replace />} />
      </Routes>
    );
  }
  // --- End Onboarding Redirects ---

  // If all onboarding is complete, render the main application routes
  return (
    <Routes>
      {/* Public routes (e.g., login, if user somehow lands here while authenticated) */}
      <Route path="/login" element={<Navigate to="/" replace />} /> {/* Redirect authenticated users from login */}

      {/* Protected routes for regular users */}
      <Route element={<PrivateRoute />}> {/* PrivateRoute acts as a role guard (non-admin) */}
        <Route element={<UserLayout />}> {/* UserLayout provides the common layout */}
          <Route index element={<Index />} /> {/* Renders at / */}
          <Route path="profile" element={<Profile />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
        </Route>
      </Route>

      {/* Protected routes for admin users */}
      <Route path="/admin" element={<AdminRoute />}> {/* AdminRoute acts as a role guard (admin) */}
        <Route element={<AdminLayout />}> {/* AdminLayout provides the common layout */}
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="manage-team" element={<ManageTeam />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
          <Route index element={<Navigate to="dashboard" replace />} /> {/* Default admin route */}
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppContent;