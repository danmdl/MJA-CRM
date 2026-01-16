import { supabase } from '@/integrations/supabase/client';

export const debugPermissions = async () => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('role', { ascending: true });
    
    console.log('Current permissions in database:', data);
    console.log('Error:', error);
    
    return data;
  } catch (error) {
    console.error('Debug error:', error);
    return null;
  }
};