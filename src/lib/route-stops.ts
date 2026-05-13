// Helpers for collapsing route stops that share the same coordinates.
//
// When two contacts live at the same address (different family members,
// roommates, etc.) their pins end up perfectly overlapping on the map.
// Stamping one pin with a combined label like "2 y 3" — and surfacing
// both names in the tooltip — is clearer than letting the upper pin
// hide the lower one entirely.

export interface StopForGroup {
  /** 1-indexed parada number as shown to the user. */
  number: number;
  lat: number;
  lng: number;
  /** Free-form title used by the marker tooltip (usually the contact name). */
  title: string;
  /** Visited flag — markers in the same group are all dimmed if every member is visited. */
  visited?: boolean;
}

export interface StopGroup {
  lat: number;
  lng: number;
  numbers: number[];
  titles: string[];
  allVisited: boolean;
}

// Rounding to 5 decimals (~1.1m) catches the "two contacts that share
// the same address but were geocoded a hair apart" case while still
// keeping pins that are 10m+ apart as separate markers.
const COORD_PRECISION = 5;
const keyFor = (lat: number, lng: number) =>
  `${lat.toFixed(COORD_PRECISION)},${lng.toFixed(COORD_PRECISION)}`;

/**
 * Group an ordered list of stops by their coordinate. Output preserves
 * input order — the first occurrence of a group dictates where it
 * lands in the result array, which is what we want for the marker
 * rendering pass (so subsequent overlaps don't shift things around).
 */
export function groupStopsByLocation(stops: StopForGroup[]): StopGroup[] {
  const byKey = new Map<string, StopGroup>();
  const order: string[] = [];
  for (const s of stops) {
    const k = keyFor(s.lat, s.lng);
    const existing = byKey.get(k);
    if (existing) {
      existing.numbers.push(s.number);
      existing.titles.push(s.title);
      existing.allVisited = existing.allVisited && !!s.visited;
    } else {
      byKey.set(k, {
        lat: s.lat,
        lng: s.lng,
        numbers: [s.number],
        titles: [s.title],
        allVisited: !!s.visited,
      });
      order.push(k);
    }
  }
  return order.map(k => byKey.get(k)!);
}

/**
 * Build a marker label for a group of stops sharing one location.
 *
 *   [1]           → "1"
 *   [2, 3]        → "2 y 3"
 *   [2, 3, 4]     → "2, 3, 4"
 *   [2, 3, 4, 5]  → "2-5"
 *
 * The single/duo cases match Dan's request for "2 y 3" verbatim. Three
 * stops still fit comma-separated in an enlarged marker; four or more
 * we collapse to a range so the label doesn't blow out the circle.
 */
export function buildGroupLabel(numbers: number[]): string {
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return String(numbers[0]);
  if (numbers.length === 2) return `${numbers[0]} y ${numbers[1]}`;
  if (numbers.length === 3) return numbers.join(', ');
  return `${numbers[0]}-${numbers[numbers.length - 1]}`;
}

/**
 * Tooltip for a grouped marker. Lists each stop number alongside the
 * matching name so a hover discloses everyone packed into the pin.
 */
export function buildGroupTitle(group: StopGroup): string {
  if (group.numbers.length === 1) {
    return `${group.numbers[0]}. ${group.titles[0]}${group.allVisited ? ' (visitado)' : ''}`;
  }
  return group.numbers
    .map((n, i) => `${n}. ${group.titles[i]}`)
    .join('\n');
}

/**
 * Marker visual size hint — bigger circles for groups so the combined
 * label has room to breathe.
 */
export function markerScaleFor(group: StopGroup): number {
  const len = group.numbers.length;
  if (len === 1) return 14;
  if (len === 2) return 18;
  if (len === 3) return 20;
  return 18; // ranges stay compact
}

/** Font size hint that pairs with markerScaleFor. */
export function markerFontSizeFor(group: StopGroup): string {
  const len = group.numbers.length;
  if (len === 1) return '13px';
  if (len === 2) return '11px';
  if (len === 3) return '9px';
  return '11px';
}
