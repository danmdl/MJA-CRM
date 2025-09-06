import { Routes, Route, Navigate } from "react-router-dom";

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
import OnboardingGuard from "./components/auth/OnboardingGuard"; // Import the new guard

const AppContent = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/initial-profile-setup" element={<InitialProfileSetup />} />
      <Route path="/password-setup" element={<PasswordSetup />} />

      {/* Main protected route, guarded by OnboardingGuard */}
      <Route element={<OnboardingGuard />}>
        {/* Routes for regular users */}
        <Route element={<PrivateRoute />}>
          <Route element={<UserLayout />}>
            <Route index element={<Index />} />
            <Route path="profile" element={<Profile />} />
            <Route path="database" element={<DatabasePage />} />
            <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
          </Route>
        </Route>

        {/* Routes for admin users */}
        <Route path="/admin" element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="manage-team" element={<ManageTeam />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route path="database" element={<DatabasePage />} />
            <Route path="csv-deduplicator" element={<CsvDeduplicatorPage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppContent;