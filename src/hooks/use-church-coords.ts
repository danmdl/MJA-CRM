import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the lat/lng of a church so we can bias address autocomplete and
 * geocoding toward its area. Without bias, ambiguous addresses (e.g.
 * "Las Heras 645") get matched to the most popular hit in Argentina,
 * which is usually Capital Federal — wrong for churches in San Martín
 * or anywhere else in GBA.
 *
 * Also returns the church's address (full string), which callers feed
 * to buildGeocodeAddress() in src/lib/geocode-address.ts. The address
 * after the first comma is the locality (e.g. "General San Martin")
 * and we use that as a textual hint to Google instead of the historical
 * hardcoded "Buenos Aires" tail (which Google reads as CABA). lat/lng
 * stays as a second-level bias for cases where Google ignores the text.
 *
 * Coords / address are read straight from `churches`. Right now MJA
 * Central is the only church with coords + address seeded; the others
 * stay NULL until their addresses are loaded. When NULL, callers should
 * fall back to no bias (Google's default behavior).
 */
export function useChurchCoords(churchId: string | null | undefined) {
  return useQuery<{ lat: number | null; lng: number | null; address: string | null } | null>({
    queryKey: ['church-coords', churchId],
    queryFn: async () => {
      if (!churchId) return null;
      const { data } = await supabase.from('churches').select('lat, lng, address').eq('id', churchId).single();
      return data as any;
    },
    enabled: !!churchId,
    staleTime: 60 * 60_000, // an hour — coords don't change
  });
}
