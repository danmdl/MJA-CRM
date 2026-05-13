// Resolves the URL `:churchId` param (a slug, post-migration) into
// the actual `churches.id` UUID so Supabase queries can keep using
// church_id as before.
//
// Usage in any nested church page:
//   const { churchId } = useParams<{ churchId: string }>(); // URL slug
//   const churchUuid = useChurchUuid();                     // resolved UUID
//   supabase.from('contacts').select(...).eq('church_id', churchUuid)
//
// Returns null while the lookup is in flight.
//
// Backward compat: if someone hits an old UUID URL, the param IS the
// UUID. The hook detects that and returns it as-is — no DB lookup.

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isUuid } from '@/lib/church-slug';

export const useChurchUuid = (): string | null => {
  const { churchId: param } = useParams<{ churchId: string }>();

  const { data } = useQuery<string | null>({
    queryKey: ['church-uuid-by-slug', param],
    queryFn: async () => {
      if (!param) return null;
      // Already a UUID? Pass through.
      if (isUuid(param)) return param;
      // Slug — resolve to UUID.
      const { data, error } = await supabase
        .from('churches')
        .select('id')
        .eq('slug', param)
        .maybeSingle();
      if (error) {
        console.error('[useChurchUuid]', error);
        return null;
      }
      return (data as { id: string } | null)?.id ?? null;
    },
    enabled: !!param,
    staleTime: 5 * 60_000,
  });

  return data ?? null;
};
