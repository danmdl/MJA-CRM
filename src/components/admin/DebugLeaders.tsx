import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Leader {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
}

const DebugLeaders = ({ churchId }: { churchId: string }) => {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      console.log('[DEBUG] Fetching leaders for churchId:', churchId);
      
      // Fetch all profiles for this church
      const { data: allProfiles, error: allProfilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('church_id', churchId);

      console.log('[DEBUG] All profiles for church:', allProfiles, allProfilesError);

      // Fetch leaders with specific roles
      const { data: leaderProfiles, error: leaderProfilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('church_id', churchId)
        .in('role', ['pastor', 'piloto', 'encargado_de_celula', 'general']);

      console.log('[DEBUG] Leader profiles for church:', leaderProfiles, leaderProfilesError);
      
      if (leaderProfiles) {
        setLeaders(leaderProfiles);
      }
      setLoading(false);
    };

    if (churchId) {
      fetchLeaders();
    }
  }, [churchId]);

  if (loading) return <div>Loading leaders debug info...</div>;

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
      <h3 className="font-bold mb-2">Debug: Leaders in Church</h3>
      <p>Church ID: {churchId}</p>
      <p>Total leaders found: {leaders.length}</p>
      <ul>
        {leaders.map(leader => (
          <li key={leader.id} className="mb-1">
            {leader.first_name} {leader.last_name} - {leader.role}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DebugLeaders;