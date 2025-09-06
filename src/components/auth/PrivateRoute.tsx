import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom'; // No longer needs Outlet here
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import UserLayout from '@/components/layout/UserLayout'; // Import UserLayout

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

  // If non-admin and all checks pass, render the UserLayout
  return <UserLayout />;
};

export default PrivateRoute;