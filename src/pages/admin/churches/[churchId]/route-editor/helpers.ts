import { normalize } from '@/lib/normalize';
import { isPointInTerritory } from '@/lib/territory-utils';

export const todayInART = (): string => {
  // Buenos Aires — used to stamp per-stop notes with the local date so
  // a referente working at 11pm Argentina time doesn't see "today's"
  // notes filed under tomorrow's UTC date.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
};

interface RouteContact {
  id: string;
  first_name: string;
  last_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  responsable_id: string | null;
  fecha_contacto: string | null;
  created_at: string | null;
}

interface FilterArgs {
  search: string;
  onlyWithNumber: boolean;
  filterResponsableId: string;
  /** Rango sobre fecha_contacto ("fecha de conexión"). */
  filterDateFrom: string;
  filterDateTo: string;
  /** Rango sobre created_at ("fecha de creación del contacto"). */
  createdFrom: string;
  createdTo: string;
  onlyInZone: boolean;
  activeTerritoryPaths: { lat: number; lng: number }[][] | null | undefined;
}

/**
 * Pure filter applied to the contacts list in the route editor's
 * picker. Mirrors what the inline `useMemo` did before extraction —
 * no behavior change. Name-only search (no address match) on purpose;
 * see MapPickerPage for the rationale.
 */
export const filterRouteContacts = <T extends RouteContact>(
  contacts: T[] | undefined,
  args: FilterArgs,
): T[] => {
  const term = normalize(args.search);
  return (contacts || []).filter(c => {
    if (args.onlyWithNumber && !/\d/.test(c.address || '')) return false;
    if (args.filterResponsableId === '__none__') {
      if (c.responsable_id) return false;
    } else if (args.filterResponsableId && c.responsable_id !== args.filterResponsableId) return false;
    if (args.filterDateFrom && (!c.fecha_contacto || c.fecha_contacto < args.filterDateFrom)) return false;
    if (args.filterDateTo && (!c.fecha_contacto || c.fecha_contacto > args.filterDateTo)) return false;
    // created_at is an ISO timestamp; the date inputs are YYYY-MM-DD.
    // Compare against the date prefix so the 'to' bound includes the
    // whole day instead of cutting off at midnight.
    const created = c.created_at ? c.created_at.slice(0, 10) : '';
    if (args.createdFrom && (!created || created < args.createdFrom)) return false;
    if (args.createdTo && (!created || created > args.createdTo)) return false;
    if (args.onlyInZone && args.activeTerritoryPaths) {
      if (!isPointInTerritory(c.lat, c.lng, args.activeTerritoryPaths ?? null)) return false;
    }
    if (term) {
      const name = normalize(`${c.first_name} ${c.last_name || ''}`);
      if (!name.includes(term)) return false;
    }
    return true;
  });
};
