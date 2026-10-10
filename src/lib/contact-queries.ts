import type { QueryClient } from '@tanstack/react-query';

// Root keys of every query whose data depends on contact rows. Mutations
// call refreshContactQueries() instead of listing keys one by one: the
// per-call lists drifted when the Semillero table moved from
// 'pool-all-contacts' to 'pool-page', and 24 call sites (plus the refresh
// button) kept invalidating a key nothing used, so the table stayed stale
// until the 60s staleTime ran out or the user hit F5.
export const CONTACT_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'pool-page',
  'pool-counts',
  'pool-distinct-cuerdas',
  'pool-distinct-responsables',
  'pool-distinct-conectores',
  'route-contact-ids',
  'papelera',
  'contacts-map',
  'contacts-territorios',
  'contacts-territory-stats',
  'mappicker-contacts',
  'mappicker-counts',
  'rutas-contacts',
  'metrics-contacts',
  'pipeline-counts',
  'process-available-contacts',
  'cell-contact-counts',
  'cellAttendeeCounts',
  'card-contacts-count',
  'overviewContactCounts',
  'recent-contacts-dashboard',
  'global-contact-search',
  'duplicates',
  'duplicate-groups',
  'dashboard-stats',
  'historial',
  'activity-logs',
]);

export function isContactQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === 'string' && CONTACT_QUERY_ROOTS.has(root);
}

/** Refetch every mounted contact view now; mark the rest stale. */
export function refreshContactQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: q => isContactQueryKey(q.queryKey) });
}
