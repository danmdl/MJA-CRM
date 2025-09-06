import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';

const OnboardingGuard = () => {
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

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profileComplete) {
    return <Navigate to="/initial-profile-setup" replace />;
  }

  if (!passwordSet) {
    return <Navigate to="/password-setup" replace />;
  }

  return <Outlet />;
};

export default OnboardingGuard;