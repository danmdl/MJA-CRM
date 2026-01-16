import { supabase } from '@/integrations/supabase/client';

export const updatePermissions = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-permissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update permissions');
    }

    return result;
  } catch (error) {
    console.error('Error updating permissions:', error);
    throw error;
  }
};