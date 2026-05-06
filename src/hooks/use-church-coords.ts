import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the lat/lng of a church so we can bias address autocomplete and
 * geocoding toward its area. Without bias, ambiguous addresses (e.g.
 * "Las Heras 645") get matched to the most popular hit in Argentina,
 * which is usually Capital Federal — wrong for churches in San Martín
 * or anywhere else in GBA.
 *
 * Coords are read straight from `churches.lat` / `churches.lng`. Right
 * now MJA Central is the only church with coords seeded; the others
 * stay NULL until their addresses are loaded. When NULL, callers should
 * fall back to no bias (Google's default behavior).
 */
export function useChurchCoords(churchId: string | null | undefined) {
  return useQuery<{ lat: number | null; lng: number | null } | null>({
    queryKey: ['church-coords', churchId],
    queryFn: async () => {
      if (!churchId) return null;
      const { data } = await supabase.from('churches').select('lat, lng').eq('id', churchId).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 60 * 60_000, // an hour — coords don't change
  });
}
