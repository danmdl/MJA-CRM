import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChurchUuid } from '@/hooks/use-church-uuid';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, MapPin, Phone, User, Users, Crosshair, ChevronDown, ChevronRight } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { isWithinGBA } from '@/lib/geo-validation';
import { geoJsonToGooglePaths, isPointInTerritory } from '@/lib/territory-utils';
import { buildGeocodeAddress } from '@/lib/geocode-address';
import { useSession } from '@/hooks/use-session';
import { normalize } from '@/lib/normalize';

// Lazy: only fetch the ~1k LOC profile dialog when the user opens it.
const ContactProfileDialog = lazy(() => import('@/components/admin/ContactProfileDialog'));

interface Issue {
  id: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  entity: 'contact' | 'cell';
  name: string;
  detail: string;
  entityId: string;
}

const CHECKS = [
  { key: 'contacts_no_coords', label: 'Contactos sin coordenadas', icon: Crosshair, severity: 'error' as const, entity: 'contact' as const },
  { key: 'contacts_bad_coords', label: 'Contactos con coordenadas fuera de zona (GBA)', icon: MapPin, severity: 'error' as const, entity: 'contact' as const },
  { key: 'contacts_no_sexo', label: 'Contactos sin sexo definido', icon: User, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'contacts_no_address', label: 'Contactos sin dirección', icon: MapPin, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'contacts_no_phone', label: 'Contactos sin teléfono', icon: Phone, severity: 'info' as const, entity: 'contact' as const },
  // Phone duplicates downgraded to 'info' — same phone is no longer a hard
  // problem (the rejecting trigger was dropped). Real duplicates are
  // people with the same name+last_name in the same church, tracked below.
  { key: 'contacts_duplicate_phone', label: 'Teléfonos compartidos', icon: Phone, severity: 'info' as const, entity: 'contact' as const },
  { key: 'contacts_duplicate_name', label: 'Posibles duplicados (mismo nombre)', icon: Users, severity: 'warning' as const, entity: 'contact' as const },
  { key: 'cells_no_address', label: 'Células sin dirección', icon: MapPin, severity: 'error' as const, entity: 'cell' as const },
  { key: 'cells_no_coords', label: 'Células con dirección pero sin coordenadas', icon: Crosshair, severity: 'error' as const, entity: 'cell' as const },
  { key: 'contacts_outside_territory', label: 'Contactos fuera del territorio de su cuerda', icon: MapPin, severity: 'warning' as const, entity: 'contact' as const },
];

const ValidatorPage = () => {
  const { churchId: churchSlug } = useParams<{ churchId: string }>();
  const churchId = useChurchUuid();
  const navigate = useNavigate();
  const { profile } = useSession();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [profileContactId, setProfileContactId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  // Collapsed state per group key. Errors stay expanded by default; warnings
  // and info collapse so the page doesn't dump 130 'sin dirección' rows on
  // first load. User can expand any group by clicking its header.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Church address — used to bias the re-geocode action toward the
  // church's locality instead of falling back to "Buenos Aires" (which
  // Google reads as CABA). Loaded on mount; null while loading.
  const [churchAddress, setChurchAddress] = useState<string | null>(null);
  // Church coords too — used as the centre of the bounds bias when
  // re-geocoding contacts. Loaded alongside the address so we don't
  // make a second roundtrip when the bulk action fires.
  const [churchLat, setChurchLat] = useState<number | null>(null);
  const [churchLng, setChurchLng] = useState<number | null>(null);
  useEffect(() => {
    if (!churchId) return;
    (async () => {
      const { data } = await supabase.from('churches').select('address, lat, lng').eq('id', churchId).single();
      if (data?.address) setChurchAddress(data.address);
      if (data?.lat != null && data?.lng != null) {
        setChurchLat(Number(data.lat));
        setChurchLng(Number(data.lng));
      }
    })();
  }, [churchId]);

  // Cuerda isolation: same rule we apply elsewhere. Below supervisor (referente,
  // encargado, consolidador, conector, anfitrion) only sees data tied to their
  // own cuerda. Supervisor / pastor / general / admin see everything in the
  // church.
  const SUPERVISOR_AND_ABOVE = ['supervisor', 'pastor', 'general', 'admin'];
  const canSeeAllCuerdas = SUPERVISOR_AND_ABOVE.includes(profile?.role || '');
  const userCuerdaNumero = profile?.numero_cuerda || null;

  const runValidation = async () => {
    if (!churchId) return;
    setLoading(true);
    const found: Issue[] = [];

    // For non-globals we filter contacts by numero_cuerda directly (it's a
    // string column on contacts) and cells by cuerda_id (after resolving the
    // user's numero -> cuerda row in this church). If the user has no cuerda
    // and isn't supervisor+, the validator shows nothing — they shouldn't be
    // chasing data outside their lane.
    let userCuerdaIds: string[] | null = null;
    if (!canSeeAllCuerdas) {
      if (!userCuerdaNumero) {
        setIssues([]);
        setLastRun(new Date());
        setLoading(false);
        return;
      }
      const { data: zonasOfChurch } = await supabase.from('zonas').select('id').eq('church_id', churchId);
      const zonaIds = (zonasOfChurch || []).map((z: any) => z.id);
      if (zonaIds.length > 0) {
        const { data: matchingCuerdas } = await supabase.from('cuerdas')
          .select('id').eq('numero', userCuerdaNumero).in('zona_id', zonaIds);
        userCuerdaIds = (matchingCuerdas || []).map((c: any) => c.id);
      } else {
        userCuerdaIds = [];
      }
    }
    // Helper: starts a contacts query already filtered to this church + alive
    // + the caller's cuerda when applicable. Saves repeating the same .eq()
    // chain on every check.
    const contactsBase = () => {
      let q = supabase.from('contacts').select('*').eq('church_id', churchId).is('deleted_at', null);
      if (!canSeeAllCuerdas && userCuerdaNumero) q = q.eq('numero_cuerda', userCuerdaNumero);
      return q;
    };
    const cellsBase = () => {
      let q = supabase.from('cells').select('*').eq('church_id', churchId).is('deleted_at', null);
      if (!canSeeAllCuerdas) {
        if (!userCuerdaIds || userCuerdaIds.length === 0) {
          // No matching cuerda — make the query return nothing.
          q = q.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          q = q.in('cuerda_id', userCuerdaIds);
        }
      }
      return q;
    };

    // 1. Contacts without coordinates (have address but no lat/lng)
    const { data: noCoords } = await contactsBase()
      .not('address', 'is', null)
      .or('lat.is.null,lng.is.null');
    (noCoords || []).filter(c => c.address && c.address.trim()).forEach(c => {
      found.push({ id: `no-coords-${c.id}`, type: 'contacts_no_coords', severity: 'error', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: `Dirección: ${c.address} — sin geolocalización` });
    });

    // 2. Contacts with bad coordinates (outside GBA)
    const { data: allWithCoords } = await contactsBase()
      .not('lat', 'is', null).not('lng', 'is', null);
    (allWithCoords || []).forEach(c => {
      if (!isWithinGBA(c.lat, c.lng)) {
        found.push({ id: `bad-coords-${c.id}`, type: 'contacts_bad_coords', severity: 'error', entity: 'contact', entityId: c.id,
          name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: `Coordenadas (${c.lat?.toFixed(2)}, ${c.lng?.toFixed(2)}) fuera de Buenos Aires` });
      }
    });

    // 3. Contacts without sexo
    const { data: noSexo } = await contactsBase()
      .or('sexo.is.null,sexo.eq.');
    (noSexo || []).forEach(c => {
      found.push({ id: `no-sexo-${c.id}`, type: 'contacts_no_sexo', severity: 'warning', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin sexo — no se puede filtrar por género en la asignación' });
    });

    // 4. Contacts without address
    const { data: noAddr } = await contactsBase()
      .or('address.is.null,address.eq.');
    (noAddr || []).forEach(c => {
      found.push({ id: `no-addr-${c.id}`, type: 'contacts_no_address', severity: 'warning', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin dirección — no se puede calcular proximidad' });
    });

    // 5. Contacts without phone
    const { data: noPhone } = await contactsBase()
      .or('phone.is.null,phone.eq.');
    (noPhone || []).forEach(c => {
      found.push({ id: `no-phone-${c.id}`, type: 'contacts_no_phone', severity: 'info', entity: 'contact', entityId: c.id,
        name: `${c.first_name} ${c.last_name || ''}`.trim(), detail: 'Sin teléfono de contacto' });
    });

    // 6. Duplicate phones
    const { data: allPhones } = await contactsBase()
      .not('phone', 'is', null);
    const phoneCounts = new Map<string, { count: number; contacts: typeof allPhones }>();
    (allPhones || []).forEach(c => {
      if (!c.phone || c.phone.trim().length < 5) return;
      const key = c.phone.replace(/\D/g, '');
      const entry = phoneCounts.get(key) || { count: 0, contacts: [] };
      entry.count++;
      entry.contacts!.push(c);
      phoneCounts.set(key, entry);
    });
    phoneCounts.forEach((v) => {
      if (v.count > 1) {
        v.contacts!.forEach(c => {
          found.push({ id: `dup-phone-${c!.id}`, type: 'contacts_duplicate_phone', severity: 'info', entity: 'contact', entityId: c!.id,
            name: `${c!.first_name} ${c!.last_name || ''}`.trim(), detail: `Teléfono ${c!.phone} compartido con ${v.count - 1} otro(s)` });
        });
      }
    });

    // 6b. Real duplicates: same first_name+last_name (normalized: lowercased,
    // stripped of accents, whitespace collapsed). Two contacts with the same
    // person's name in the same church are very likely the same person —
    // worth surfacing as a warning so a leader can merge or correct.
    const { data: allNames } = await contactsBase()
      .select('id, first_name, last_name');
    const nameGroups = new Map<string, { contacts: typeof allNames }>();
    (allNames || []).forEach(c => {
      const full = normalize(`${c.first_name || ''} ${c.last_name || ''}`).replace(/\s+/g, ' ').trim();
      if (!full) return;
      const entry = nameGroups.get(full) || { contacts: [] };
      entry.contacts!.push(c);
      nameGroups.set(full, entry);
    });
    nameGroups.forEach((v) => {
      if (v.contacts!.length > 1) {
        v.contacts!.forEach(c => {
          const others = v.contacts!.filter(x => x.id !== c.id).length;
          found.push({ id: `dup-name-${c.id}`, type: 'contacts_duplicate_name', severity: 'warning', entity: 'contact', entityId: c.id,
            name: `${c.first_name} ${c.last_name || ''}`.trim(),
            detail: `Mismo nombre que ${others} otro(s) contacto(s) en esta iglesia` });
        });
      }
    });

    // 7. Cells without address
    const { data: cellsNoAddr } = await cellsBase()
      .or('address.is.null,address.eq.');
    (cellsNoAddr || []).forEach(c => {
      found.push({ id: `cell-no-addr-${c.id}`, type: 'cells_no_address', severity: 'error', entity: 'cell', entityId: c.id,
        name: c.name, detail: 'Sin dirección — invisible en el mapa y cálculo de proximidad' });
    });

    // 8. Cells with address but no coordinates
    const { data: cellsNoCoords } = await cellsBase()
      .not('address', 'is', null)
      .or('lat.is.null,lng.is.null');
    (cellsNoCoords || []).filter(c => c.address && c.address.trim()).forEach(c => {
      found.push({ id: `cell-no-coords-${c.id}`, type: 'cells_no_coords', severity: 'error', entity: 'cell', entityId: c.id,
        name: c.name, detail: `Dirección: ${c.address} — sin geolocalización` });
    });

    // 9. Contacts outside their cuerda's territory
    // Only checks cuerdas that have a drawn territory polygon.
    const { data: cuerdasWithTerritory } = await supabase
      .from('cuerdas_with_geojson')
      .select('id, numero, territory_geojson')
      .not('territory_geojson', 'is', null);
    if (cuerdasWithTerritory && cuerdasWithTerritory.length > 0) {
      // paths is google.maps-style { lat, lng }[][] (the shape returned
      // by geoJsonToGooglePaths), not raw number[][][] coordinates.
      const territoryMap = new Map<string, { numero: string; paths: { lat: number; lng: number }[][] }>();
      for (const cu of cuerdasWithTerritory) {
        const paths = geoJsonToGooglePaths(cu.territory_geojson);
        if (paths) territoryMap.set(cu.id, { numero: cu.numero, paths });
      }
      if (territoryMap.size > 0) {
        // Get all contacts with coords that belong to a cuerda with territory
        const cuerdaIds = Array.from(territoryMap.keys());
        const { data: cuerdaRows } = await supabase.from('cuerdas').select('id, numero').in('id', cuerdaIds);
        const cuerdaNumeros = new Set((cuerdaRows || []).map(c => c.numero));
        // Fetch contacts in those cuerdas
        const { data: contactsInTerritoryCuerdas } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, lat, lng, numero_cuerda')
          .eq('church_id', churchId!)
          .is('deleted_at', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .not('numero_cuerda', 'is', null);
        for (const ct of (contactsInTerritoryCuerdas || [])) {
          if (!ct.numero_cuerda || !cuerdaNumeros.has(ct.numero_cuerda)) continue;
          // Find the cuerda entry
          const cuerdaEntry = Array.from(territoryMap.entries()).find(([, v]) => v.numero === ct.numero_cuerda);
          if (!cuerdaEntry) continue;
          const [, { paths }] = cuerdaEntry;
          if (!isPointInTerritory(ct.lat!, ct.lng!, paths)) {
            const name = `${ct.first_name} ${ct.last_name || ''}`.trim();
            found.push({
              id: `contact-outside-${ct.id}`,
              type: 'contacts_outside_territory',
              severity: 'warning',
              entity: 'contact',
              entityId: ct.id,
              name,
              detail: `Cuerda ${ct.numero_cuerda} tiene territorio pero este contacto está fuera de zona`,
            });
          }
        }
      }
    }

    setIssues(found);
    setLastRun(new Date());
    setLoading(false);
  };

  useEffect(() => { runValidation(); }, [churchId, canSeeAllCuerdas, userCuerdaNumero]);

  // Whenever issues change, reset expanded set to just the error groups so
  // the user immediately sees what's broken without scrolling through 130
  // 'sin dirección' rows. Warnings/info collapse — click to expand.
  useEffect(() => {
    const errorKeys = CHECKS.filter(c => c.severity === 'error' && issues.some(i => i.type === c.key)).map(c => c.key);
    setExpandedGroups(new Set(errorKeys));
  }, [issues]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const grouped = CHECKS.map(check => ({
    ...check,
    items: issues.filter(i => i.type === check.key),
  }));

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  const totalIssues = issues.length;

  const [geocodePreview, setGeocodePreview] = useState<{ contactId: string; address: string; lat: number; lng: number; valid: boolean } | null>(null);
  const [geocoding, setGeocoding] = useState<string | null>(null);

  const tryReGeocode = async (contactId: string, address: string) => {
    if (!(window as any).google?.maps) { showError('Google Maps no cargado. Recargá la página.'); return; }
    setGeocoding(contactId);
    setGeocodePreview(null);
    const geocoder = new (window as any).google.maps.Geocoder();
    const searchAddr = buildGeocodeAddress(address, churchAddress);
    geocoder.geocode({ address: searchAddr }, (results: any[], status: string) => {
      setGeocoding(null);
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const lat = results[0].geometry.location.lat();
        const lng = results[0].geometry.location.lng();
        const valid = isWithinGBA(lat, lng);
        setGeocodePreview({ contactId, address: results[0].formatted_address, lat, lng, valid });
      } else {
        showError('No se pudo geocodear esta dirección.');
      }
    });
  };

  const confirmGeocode = async () => {
    if (!geocodePreview) return;
    if (geocodePreview.valid) {
      await supabase.from('contacts').update({ lat: geocodePreview.lat, lng: geocodePreview.lng, address: geocodePreview.address }).eq('id', geocodePreview.contactId);
      showSuccess(`Coordenadas corregidas: ${geocodePreview.address}`);
    } else {
      await supabase.from('contacts').update({ lat: null, lng: null }).eq('id', geocodePreview.contactId);
      showSuccess('Coordenadas eliminadas (fuera de zona). Corregí la dirección manualmente.');
    }
    setGeocodePreview(null);
    runValidation();
  };

  const clearCoords = async (contactId: string) => {
    await supabase.from('contacts').update({ lat: null, lng: null }).eq('id', contactId);
    showSuccess('Coordenadas eliminadas. Editá la dirección manualmente desde el Semillero.');
    runValidation();
  };

  // ─── Bulk re-geocode of contacts whose coords landed in CABA when their ─────
  // address never mentions Capital. Built specifically for the cleanup
  // after the locality backfill — those contacts now have proper
  // addresses ('Mendoza 407, General San Martín, Buenos Aires') so a
  // fresh geocode from the address should land in the right town.
  //
  // Why client-side and not a server batch:
  //   - The Google Geocoder via the Maps JS SDK is already loaded in the
  //     browser (no extra script needed).
  //   - Running from the browser means the user's session controls the
  //     pace and can interrupt by closing the tab — no risk of an
  //     edge function chewing through the API quota in the background.
  //   - Each call gets its own RLS-checked supabase.from('contacts')
  //     update, so we re-use the existing access policy.
  //
  // Throttled at one call every 200ms (5/sec) which keeps us comfortably
  // under Google's free-tier rate limits (50 req/sec) and still finishes
  // 896 contacts in roughly 3 minutes.
  //
  // Safety rails:
  //   - Only contacts in the current church get touched.
  //   - Only contacts whose lat/lng falls inside CABA's bounding box AND
  //     whose address text doesn't mention Capital are eligible. The
  //     ones that legitimately live in CABA (and do say so) are skipped.
  //   - New coords are only saved if they pass isWithinGBA(). Outside
  //     that box → leave the old coords alone (don't NULL them; the user
  //     might want them as a hint until they edit the address).
  //   - Failures (Google says ZERO_RESULTS, OVER_QUERY_LIMIT, etc.) are
  //     logged in-page and skipped, not silently retried — surfacing
  //     them tells the user which contacts have addresses Google can't
  //     parse so they can fix them by hand.
  const [bulkRegeocoding, setBulkRegeocoding] = useState(false);
  // Five buckets now (was three) so the user understands what really
  // changed:
  //   fixed       — got a new coordinate that's plausibly correct
  //                 (inside GBA, outside the CABA box, address doesn't
  //                 say capital)
  //   cleared     — address had no street number, geocoder will only
  //                 ever return a centroid; we set lat/lng to NULL
  //                 instead of keeping a misleading pin
  //   stillInCaba — re-geocoded but result still landed in CABA box
  //                 even after retrying with a province-biased tail.
  //                 We keep the OLD coords (don't overwrite) so the
  //                 user can spot them visually and manually edit.
  //   outOfZone   — geocoded outside GBA entirely; address probably
  //                 broken; old coords kept.
  //   failed      — Google returned ZERO_RESULTS / OVER_QUERY_LIMIT /
  //                 etc.; old coords kept.
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, fixed: 0, cleared: 0, stillInCaba: 0, outOfZone: 0, failed: 0 });
  const bulkAbortRef = React.useRef(false);

  const isInsideCABA = (lat: number, lng: number) =>
    lat >= -34.71 && lat <= -34.50 && lng >= -58.55 && lng <= -58.33;

  const addressMentionsCapital = (addr: string) => {
    const norm = addr.toLowerCase();
    return norm.includes('caba') || norm.includes('capital') || norm.includes('ciudad autonoma') || norm.includes('ciudad autónoma');
  };

  // Heuristic: an address "has a street number" if it contains at least
  // one digit AND that digit isn't trivially short (we don't want '1' or
  // '2' to count). Used to decide whether to even bother geocoding —
  // street-less addresses ("Villa Lynch", "Villa Maipú, Gral. San
  // Martín") will only ever resolve to a Google-picked centroid which is
  // useless for routing, often just barely inside the CABA box even when
  // the real neighbourhood isn't.
  const addressHasStreetNumber = (addr: string) => {
    const trimmed = (addr || '').trim();
    if (trimmed.length < 6) return false;
    return /\d{2,}/.test(trimmed);
  };

  const bulkRegeocodeCABA = async () => {
    if (!(window as any).google?.maps) {
      showError('Google Maps no cargado. Recargá la página y volvé a intentar.');
      return;
    }
    if (!churchId) return;

    setBulkRegeocoding(true);
    bulkAbortRef.current = false;
    setBulkProgress({ done: 0, total: 0, fixed: 0, cleared: 0, stillInCaba: 0, outOfZone: 0, failed: 0 });

    // Pull candidates. Pagination not needed at 896 rows but we cap at
    // 2000 to be safe in case the criteria match more after future
    // imports.
    const { data: candidates, error } = await supabase
      .from('contacts')
      .select('id, address, lat, lng')
      .eq('church_id', churchId)
      .is('deleted_at', null)
      .not('address', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(2000);

    if (error || !candidates) {
      setBulkRegeocoding(false);
      showError('No se pudo cargar la lista de candidatos.');
      return;
    }

    // Filter client-side — Postgres can't cheaply express the
    // 'inside-CABA AND address-doesnt-mention-capital' combo without
    // building a materialized view. With <4000 rows in flight a JS
    // filter is fine.
    const eligible = candidates.filter(c =>
      isInsideCABA(Number(c.lat), Number(c.lng)) &&
      !addressMentionsCapital(c.address || '')
    );

    setBulkProgress(p => ({ ...p, total: eligible.length }));

    if (eligible.length === 0) {
      setBulkRegeocoding(false);
      showSuccess('No hay contactos para re-geocodificar.');
      return;
    }

    const geocoder = new (window as any).google.maps.Geocoder();
    let fixed = 0, cleared = 0, stillInCaba = 0, outOfZone = 0, failed = 0;

    // Bounds bias: when the church has a known location, we constrain
    // the geocoder to a ~12km box around it. Soft hint, not strict —
    // Google can return a result outside the box, but it'll prefer
    // matches inside. Pulls "Israel 5013" toward the Israel street in
    // Villa Lynch (San Martín) instead of the one in Devoto (CABA).
    let churchBounds: any = null;
    if (churchLat != null && churchLng != null) {
      const gmaps = (window as any).google.maps;
      // 0.11 degrees ≈ 12km in latitude, slightly more in longitude
      // at this latitude. Generous on purpose so we don't filter out
      // legitimate contacts living a town or two over from the church.
      churchBounds = new gmaps.LatLngBounds(
        new gmaps.LatLng(churchLat - 0.11, churchLng - 0.13),
        new gmaps.LatLng(churchLat + 0.11, churchLng + 0.13),
      );
    }

    // Helper: single geocode attempt. Returns ok+coords or ok:false.
    const tryGeocode = async (addr: string, useBounds: boolean) => {
      const req: any = { address: addr, region: 'AR' };
      if (useBounds && churchBounds) req.bounds = churchBounds;
      return new Promise<{ ok: boolean; lat?: number; lng?: number }>((resolve) => {
        geocoder.geocode(req, (results: any[], status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            resolve({
              ok: true,
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
            });
          } else {
            resolve({ ok: false });
          }
        });
      });
    };

    for (let i = 0; i < eligible.length; i++) {
      if (bulkAbortRef.current) break;
      const c = eligible[i];
      const rawAddr = c.address || '';

      // Branch 1 — address has no street number. Geocoder will only
      // ever return a Google-picked centroid (not a real building).
      // Set lat/lng to NULL so the contact disappears from the map
      // instead of pretending to be in Capital. Honest > misleading.
      if (!addressHasStreetNumber(rawAddr)) {
        await supabase.from('contacts')
          .update({ lat: null, lng: null })
          .eq('id', c.id);
        cleared++;
        setBulkProgress({ done: i + 1, total: eligible.length, fixed, cleared, stillInCaba, outOfZone, failed });
        // No geocode happened, so no rate-limit pause needed — this
        // path is just a DB write. Move on.
        continue;
      }

      // Branch 2 — address has a street number. Two-attempt geocode
      // with progressively stronger province hints, both bounds-biased.
      const builtAddr = buildGeocodeAddress(rawAddr, churchAddress);
      let result = await tryGeocode(builtAddr, true);

      // If first attempt landed in CABA box (and address doesn't mention
      // capital), retry with an explicit "provincia de Buenos Aires"
      // suffix that disambiguates from Capital Federal harder than the
      // bare "Buenos Aires" suffix does. Google reads "Buenos Aires"
      // as CABA by default; "provincia de Buenos Aires" forces the
      // province interpretation.
      if (result.ok && isInsideCABA(result.lat!, result.lng!)) {
        const altAddr = `${rawAddr.trim()}, provincia de Buenos Aires, Argentina`;
        result = await tryGeocode(altAddr, true);
        // Inter-call throttle for the retry too
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (!result.ok) {
        failed++;
      } else if (!isWithinGBA(result.lat!, result.lng!)) {
        // Result outside GBA → address probably broken; keep old coords
        outOfZone++;
      } else if (isInsideCABA(result.lat!, result.lng!)) {
        // Even after retry we're still in CABA. Keep OLD coords (don't
        // overwrite with another wrong value) and count separately so
        // the user knows these need manual editing of the address.
        stillInCaba++;
      } else {
        // Plausibly correct: inside GBA, outside CABA box. Save it.
        await supabase.from('contacts')
          .update({ lat: result.lat, lng: result.lng })
          .eq('id', c.id);
        fixed++;
      }

      setBulkProgress({ done: i + 1, total: eligible.length, fixed, cleared, stillInCaba, outOfZone, failed });

      // 200ms between calls — keeps us at 5/sec, under the 50/sec free
      // tier limit with plenty of margin if the user has other tabs
      // also using the API.
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setBulkRegeocoding(false);
    const parts = [
      `${fixed} corregidos`,
      cleared > 0 ? `${cleared} sin calle (limpiados)` : null,
      stillInCaba > 0 ? `${stillInCaba} siguen en CABA (revisar dirección)` : null,
      outOfZone > 0 ? `${outOfZone} fuera de zona` : null,
      failed > 0 ? `${failed} sin resultado` : null,
    ].filter(Boolean).join(', ');
    showSuccess(`Listo. ${parts}.`);
    runValidation();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Validador de Datos
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Escaneo automático de problemas en contactos y células
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && <span className="text-[10px] text-muted-foreground">Último escaneo: {lastRun.toLocaleTimeString()}</span>}
          <Button size="sm" variant="outline" onClick={runValidation} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Escaneando...' : 'Re-escanear'}
          </Button>
        </div>
      </div>

      {/* Bulk re-geocode panel — only meaningful for global roles
          (admin/general/pastor/supervisor). Below supervisor each user
          sees their own cuerda's issues only and a per-contact
          re-geocode button is the right granularity for them. */}
      {canSeeAllCuerdas && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <p className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-500" />
                Re-geocodificar contactos en CABA
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vuelve a calcular las coordenadas de los contactos cuya posición cayó en Capital Federal pero la dirección no menciona Capital. Tarda ~3 minutos para 900 contactos. Se puede pausar cerrando la página.
              </p>
            </div>
            {!bulkRegeocoding ? (
              <Button size="sm" variant="outline" onClick={bulkRegeocodeCABA} className="gap-1.5 shrink-0">
                <RefreshCw className="h-3.5 w-3.5" />
                Empezar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { bulkAbortRef.current = true; }} className="gap-1.5 shrink-0">
                <XCircle className="h-3.5 w-3.5" />
                Cancelar
              </Button>
            )}
          </div>
          {(bulkRegeocoding || bulkProgress.done > 0) && (
            <div className="mt-3 space-y-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: bulkProgress.total > 0 ? `${(bulkProgress.done / bulkProgress.total) * 100}%` : '0%' }}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                <span>{bulkProgress.done} / {bulkProgress.total}</span>
                <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-green-400">{bulkProgress.fixed} corregidos</span>
                  {bulkProgress.cleared > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-blue-400" title="Sin calle ni número en la dirección — se les borraron las coordenadas para que no aparezcan mal en el mapa.">
                        {bulkProgress.cleared} sin calle
                      </span>
                    </>
                  )}
                  {bulkProgress.stillInCaba > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-orange-400" title="El geocoder los siguió ubicando en CABA aunque la dirección dice San Martín. Hay que editar la dirección manualmente.">
                        {bulkProgress.stillInCaba} siguen en CABA
                      </span>
                    </>
                  )}
                  {bulkProgress.outOfZone > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-400">{bulkProgress.outOfZone} fuera de zona</span>
                    </>
                  )}
                  {bulkProgress.failed > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-red-400">{bulkProgress.failed} sin resultado</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-4 gap-3">
          <div className={`rounded-lg border p-3 ${totalIssues === 0 ? 'border-green-500/30 bg-green-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className={`text-2xl font-bold ${totalIssues === 0 ? 'text-green-500' : 'text-foreground'}`}>{totalIssues}</p>
          </div>
          <div className={`rounded-lg border p-3 ${errorCount > 0 ? 'border-red-500/30 bg-red-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Errores</p>
            <p className={`text-2xl font-bold ${errorCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{errorCount}</p>
          </div>
          <div className={`rounded-lg border p-3 ${warningCount > 0 ? 'border-yellow-500/30 bg-yellow-500/5' : ''}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Advertencias</p>
            <p className={`text-2xl font-bold ${warningCount > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{warningCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Info</p>
            <p className={`text-2xl font-bold ${infoCount > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>{infoCount}</p>
          </div>
        </div>
      )}

      {/* All green */}
      {!loading && totalIssues === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-500">Todo en orden</p>
          <p className="text-xs text-muted-foreground mt-1">No se encontraron problemas de datos.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Escaneando datos...</p>
        </div>
      )}

      {/* Issue groups — collapsible. Header is always visible (icon + name +
          count + chevron). Body of each group only renders when expanded so
          DOM stays light even when there are 130 rows in a group. Errors
          start expanded; warnings/info start collapsed. */}
      {!loading && grouped.map(group => {
        if (group.items.length === 0) return null;
        const Icon = group.icon;
        const isOpen = expandedGroups.has(group.key);
        const sevColor = group.severity === 'error' ? 'text-red-500 border-red-500/30 bg-red-500/5'
          : group.severity === 'warning' ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/5'
          : 'text-blue-400 border-blue-400/30 bg-blue-400/5';
        const badgeColor = group.severity === 'error' ? 'bg-red-500/15 text-red-400'
          : group.severity === 'warning' ? 'bg-yellow-500/15 text-yellow-500'
          : 'bg-blue-400/15 text-blue-400';

        return (
          <div key={group.key} className={`rounded-lg border ${sevColor}`}>
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-foreground/5 transition-colors text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold flex-1 truncate">{group.label}</span>
              <Badge className={`text-[10px] ${badgeColor} shrink-0`}>{group.items.length}</Badge>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-current/20 pt-3">
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded px-3 py-2 bg-background/50 border border-border/50">
                    <div className="min-w-0">
                      <button
                        className="text-sm font-medium text-primary hover:underline text-left"
                        onClick={() => {
                          if (item.entity === 'contact') setProfileContactId(item.entityId);
                          else if (item.entity === 'cell') navigate(`/admin/churches/${churchSlug}/celulas`);
                        }}
                      >
                        {item.name}
                      </button>
                      <span className="text-[10px] text-muted-foreground ml-2">{item.detail}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.entity === 'contact' && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => navigate(`/admin/churches/${churchSlug}/pool`)}>
                        Ir al Semillero
                      </Button>
                    )}
                    {item.entity === 'cell' && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => navigate(`/admin/churches/${churchSlug}/celulas`)}>
                        Ir a Células
                      </Button>
                    )}
                    {item.type === 'contacts_bad_coords' && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={geocoding === item.entityId}
                          onClick={() => tryReGeocode(item.entityId, item.detail.split('fuera')[0].replace('Coordenadas (', '').trim())}>
                          {geocoding === item.entityId ? '...' : 'Re-geocodear'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-400" onClick={() => clearCoords(item.entityId)}>
                          Borrar
                        </Button>
                      </div>
                    )}
                    {item.type === 'contacts_no_coords' && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={geocoding === item.entityId}
                        onClick={() => {
                          const addr = item.detail.replace('Dirección: ', '').replace(' — sin geolocalización', '');
                          tryReGeocode(item.entityId, addr);
                        }}>
                        {geocoding === item.entityId ? '...' : 'Geocodear'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        );
      })}
      {/* Geocode preview */}
      {geocodePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGeocodePreview(null)}>
          <div className="bg-background border rounded-lg p-5 max-w-md w-full mx-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm">Resultado del geocodeo</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Dirección encontrada:</span> {geocodePreview.address}</p>
              <p><span className="text-muted-foreground">Coordenadas:</span> {geocodePreview.lat.toFixed(5)}, {geocodePreview.lng.toFixed(5)}</p>
              <p>
                <span className="text-muted-foreground">Dentro de Buenos Aires:</span>{' '}
                {geocodePreview.valid
                  ? <span className="text-green-500 font-medium">✅ Sí — coordenadas correctas</span>
                  : <span className="text-red-500 font-medium">❌ No — fuera de zona (se borrarán las coordenadas)</span>
                }
              </p>
            </div>
            {geocodePreview.valid && (
              <a href={`https://www.google.com/maps?q=${geocodePreview.lat},${geocodePreview.lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                Ver en Google Maps ↗
              </a>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setGeocodePreview(null)}>Cancelar</Button>
              <Button size="sm" onClick={confirmGeocode}>
                {geocodePreview.valid ? 'Guardar coordenadas' : 'Borrar coordenadas'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Contact profile dialog - opens when clicking a contact name in a validation row */}
      {profileContactId && (
        <Suspense fallback={null}>
          <ContactProfileDialog
            open
            onOpenChange={(o) => { if (!o) { setProfileContactId(null); runValidation(); } }}
            contactId={profileContactId}
            churchId={churchId!}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ValidatorPage;
