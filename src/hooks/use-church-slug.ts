import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isUuid } from '@/lib/church-slug';

/**
 * Resolve a church UUID (or pass-through slug) into the canonical slug used
 * in URLs. Returns null while loading or if the row isn't found.
 *
 * Used by Sidebar, dashboards, notifications — anywhere we have a UUID from
 * `profile.church_id` or a churches row and need to build a `/admin/churches/<slug>/...` URL.
 */
export const useChurchSlugByUuid = (uuid: string | null | undefined): string | null => {
  const { data } = useQuery({
    queryKey: ['church-slug-by-uuid', uuid],
    queryFn: async () => {
      if (!uuid) return null;
      if (!isUuid(uuid)) return uuid; // already a slug — pass through
      const { data } = await supabase.from('churches').select('slug').eq('id', uuid).maybeSingle();
      return (data as { slug: string } | null)?.slug ?? null;
    },
    enabled: !!uuid,
    staleTime: 5 * 60_000,
  });
  return data ?? null;
};
