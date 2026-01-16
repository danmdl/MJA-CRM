import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FixPermissions = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fixPermissions = async () => {
      try {
        setStatus('loading');
        setMessage('Updating permissions...');

        // Get the current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error('No active session found. Please log in first.');
        }

        // Call the update-permissions edge function
        const SUPABASE_URL = "https://jczsgvaednptnypxhcje.supabase.co";
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjenNndmFlZG5wdG55cHhoY2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzk0MTcsImV4cCI6MjA3MjYxNTQxN30.fkM8Kmp-0heCej9dxoZfH3JRHmzS9AXlbGcf8meZS7U";

        const response = await fetch(`${SUPABASE_URL}/functions/v1/update-permissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update permissions: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        
        if (result.success) {
          setStatus('success');
          setMessage('Permissions updated successfully! You can now manage user roles.');
        } else {
          throw new Error(result.error || 'Unknown error occurred');
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(`Error: ${error.message}`);
        console.error('Permission update error:', error);
      }
    };

    fixPermissions();
  }, []);

  const handleContinue = () => {
    navigate('/admin/dashboard');
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4">
            {status === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-blue-600" />}
            {status === 'success' && <CheckCircle className="h-8 w-8 text-green-600" />}
            {status === 'error' && <AlertCircle className="h-8 w-8 text-red-600" />}
          </div>
          <CardTitle>
            {status === 'loading' && 'Updating Permissions'}
            {status === 'success' && 'Permissions Updated'}
            {status === 'error' && 'Error'}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'success' && (
            <Button onClick={handleContinue} className="w-full">
              Continue to Dashboard
            </Button>
          )}
          {status === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please try again or contact support if the issue persists.
              </p>
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FixPermissions;