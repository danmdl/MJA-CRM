import { useEffect, useState } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import Index from '@/pages/Index';
import Profile from '@/pages/Profile'; // Import Profile page
import UserLayout from '@/components/layout/UserLayout'; // Import UserLayout

const PrivateRoute = () => {
  const { session, loading: sessionLoading } = useSession();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session) {
      setLoading(false);
      return;
    }

    const fetchUserRole = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        setUserRole('user'); 
      } else if (data) {
        setUserRole(data.role);
      }
      setLoading(false);
    };

    fetchUserRole();
  }, [session, sessionLoading]);

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (userRole === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // For non-admin authenticated users, render UserLayout with nested routes
  return (
    <UserLayout>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/profile" element={<Profile />} />
        {/* Add other user-specific routes here if needed */}
        <Route index element={<Navigate to="/" replace />} />
      </Routes>
    </UserLayout>
  );
};

export default PrivateRoute;