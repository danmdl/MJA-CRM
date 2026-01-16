import { supabase } from '@/integrations/supabase/client';

export const updatePermissions = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session');
    }

    // Use the correct Supabase URL from the client
    const supabaseUrl = supabase.supabaseUrl;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/update-permissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabase.supabaseKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating permissions:', error);
    throw error;
  }
};