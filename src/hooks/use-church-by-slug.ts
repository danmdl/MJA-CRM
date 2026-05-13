// Resolves a church-route param that can be EITHER a slug or a UUID
// into the actual church row plus a redirect hint.
//
// Usage (inside the church-route layout):
//
//   const { churchId } = useParams();
//   const { church, redirectTo, isLoading } = useChurchBySlugOrId(churchId);
//   useEffect(() => { if (redirectTo) navigate(redirectTo, { replace: true }); }, [redirectTo]);
//
// Backwards compatibility: old bookmarks with the UUID land here, get
// resolved to the church row, and useChurchBySlugOrId returns
// redirectTo = '/admin/churches/<slug>/...'. The layout then quietly
// rewrites the URL bar.

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isUuid } from '@/lib/church-slug';

export interface ResolvedChurch {
  id: string;
  name: string;
  slug: string;
}

export interface ChurchResolution {
  church: ResolvedChurch | null;
  /** Set to the canonical slug-based URL when the caller landed on a
   *  UUID URL — caller should navigate to it with replace:true. */
  redirectTo: string | null;
  isLoading: boolean;
  notFound: boolean;
}

const fetchBy = async (key: 'id' | 'slug', value: string): Promise<ResolvedChurch | null> => {
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, slug')
    .eq(key, value)
    .maybeSingle();
  if (error) {
    console.error('[useChurchBySlugOrId]', error);
    return null;
  }
  return data as ResolvedChurch | null;
};

export const useChurchBySlugOrId = (slugOrId: string | undefined): ChurchResolution => {
  const location = useLocation();

  const lookingForUuid = !!slugOrId && isUuid(slugOrId);

  const { data, isLoading } = useQuery<ResolvedChurch | null>({
    queryKey: ['church-by-slug-or-id', slugOrId, lookingForUuid],
    queryFn: () => slugOrId ? fetchBy(lookingForUuid ? 'id' : 'slug', slugOrId) : Promise.resolve(null),
    enabled: !!slugOrId,
    staleTime: 5 * 60_000,
  });

  if (!slugOrId) {
    return { church: null, redirectTo: null, isLoading: false, notFound: false };
  }
  if (isLoading) {
    return { church: null, redirectTo: null, isLoading: true, notFound: false };
  }
  if (!data) {
    return { church: null, redirectTo: null, isLoading: false, notFound: true };
  }

  // If they landed on the UUID URL, suggest the slug URL.
  let redirectTo: string | null = null;
  if (lookingForUuid && data.slug) {
    redirectTo = location.pathname.replace(slugOrId, data.slug) + location.search + location.hash;
  }

  return { church: data, redirectTo, isLoading: false, notFound: false };
};
