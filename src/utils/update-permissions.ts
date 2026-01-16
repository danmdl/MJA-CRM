import { supabase } from '@/integrations/supabase/client';

export const updatePermissions = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session');
    }

    // Use the hardcoded Supabase URL from the client configuration
    const SUPABASE_URL = "https://jczsgvaednptnypxhcje.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjenNndmFlZG5wdG55cHhoY2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzk0MTcsImV4cCI6MjA3MjYxNTQxN30.fkM8Kmp-0heCej9dxoZfH3JRHmzS9AXlbGcf8meZS7U";

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/update-permissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating permissions:', error);
    throw error;
  }
};