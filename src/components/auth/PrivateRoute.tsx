import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import Index from '@/pages/Index';

const PrivateRoute = () => {
  const { session, loading: sessionLoading } = useSession();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !session) {
      if (!sessionLoading) setLoading(false);
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

  return <Index />;
};

export default PrivateRoute;