import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import Index from '@/pages/Index';

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
        // If profile doesn't exist, treat as incomplete
        setProfileComplete(false);
        setUserRole('user'); // Default role if profile fetch fails
      } else if (profile) {
        setUserRole(profile.role);
        if (profile.first_name && profile.last_name) {
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } else {
        // No profile found, treat as incomplete
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

  // If profile is not complete (missing first_name or last_name), redirect to initial setup
  if (!profileComplete) {
    return <Navigate to="/initial-profile-setup" replace />;
  }

  // Check if password needs to be set (this is a heuristic, Supabase usually handles it via redirectTo)
  // For invited users, after setting name, they should set password.
  // If the user has a session and profile is complete, but they are coming from an invite flow,
  // they might still need to set a password. We'll redirect them to PasswordSetup.
  // A more robust check would involve checking `session.user.email_confirmed_at` vs `session.user.last_sign_in_at`
  // or a custom flag in the profile, but for now, we assume if they just completed profile, password is next.
  // This logic might need refinement based on actual Supabase invite behavior.
  // For simplicity, if they are not an admin and just completed profile, we assume they need to set password.
  // If they are an admin, they might have set it during invite.
  if (session && profileComplete && !session.user.last_sign_in_at) { // Heuristic: if no last_sign_in_at, might be first login after invite
     return <Navigate to="/password-setup" replace />;
  }


  if (userRole === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Index />;
};

export default PrivateRoute;