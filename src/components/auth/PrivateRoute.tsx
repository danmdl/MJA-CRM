import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom'; // Ensure Outlet is imported
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
// Index is no longer directly rendered here, it's a child of the / route

const PrivateRoute = () => {
  const { session, loading: sessionLoading } = useSession();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session) {
      setLoadingProfile(false);
      return;
    }

    const fetchUserProfile = async () => {
      setLoadingProfile(true);
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        setProfileComplete(false);
        setUserRole('user');
      } else if (profile) {
        setUserRole(profile.role);
        if (profile.first_name && profile.last_name) {
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } else {
        setProfileComplete(false);
        setUserRole('user');
      }
      setLoadingProfile(false);
    };

    fetchUserProfile();
  }, [session, sessionLoading]);

  if (loadingProfile || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profileComplete) {
    return <Navigate to="/initial-profile-setup" replace />;
  }

  if (session && profileComplete && !session.user.last_sign_in_at) {
     return <Navigate to="/password-setup" replace />;
  }

  if (userRole === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // For non-admin users, render the nested routes via Outlet
  return <Outlet />;
};

export default PrivateRoute;