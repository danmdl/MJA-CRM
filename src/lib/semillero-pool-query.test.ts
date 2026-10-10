import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolFilters } from './semillero-pool-query';

// Recording fake of the supabase-js query builder: every chained call is
// logged as [method, ...args] and awaiting it resolves to `nextResult`.
type Call = [string, ...any[]];
const builds: Call[][] = [];
let results: Array<{ data: any[]; count?: number; error: any }> = [];

function makeBuilder() {
  const calls: Call[] = [];
  builds.push(calls);
  const proxy: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const r = results.shift() ?? { data: [], count: 0, error: null };
        return (resolve: any) => resolve(r);
      }
      return (...args: any[]) => { calls.push([prop, ...args]); return proxy; };
    },
  });
  return proxy;
}

const rpcCalls: Array<[string, Record<string, unknown>]> = [];
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
let rpcQueue: Array<{ data: unknown; error: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder().from(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push([name, args]);
      const chain: any = {
        order: () => chain,
        range: () => chain,
        then: (resolve: any) => resolve(rpcQueue.length ? rpcQueue.shift() : rpcResult),
      };
      return chain;
    },
  },
}));

const { fetchPoolPage, fetchPoolAll, fetchPoolByIds, fetchDuplicateGroups, fetchDistinctConectores, fetchDistinctCuerdas, ESTADO_CIVIL_PATTERNS } = await import('./semillero-pool-query');

const baseFilters: PoolFilters = {
  churchId: 'church-1',
  userId: 'user-1',
  userRole: 'admin',
  userCuerda: null,
  canSeeAllCuerdas: true,
  pool: 'unassigned',
  search: '',
  filterCuerda: '',
  filterResponsable: '',
  filterConector: '',
  filterOnlyWithCoords: false,
  restrictToCuerda: null,
  churchCuerdaNumero: 'MJA Central',
  tab: null,
  routeFilter: '',
  routeContactIds: null,
  sortBy: null,
  sortDir: 'asc',
  page: 0,
  pageSize: 200,
};

const lastCalls = () => builds[builds.length - 1];
const has = (calls: Call[], ...expected: any[]) =>
  calls.some(c => JSON.stringify(c) === JSON.stringify(expected));

beforeEach(() => { builds.length = 0; results = []; rpcCalls.length = 0; rpcResult = { data: [], error: null }; rpcQueue = []; });

describe('fetchPoolPage — solapa filters run server-side', () => {
  it('without a solapa only applies the pool gate', async () => {
    await fetchPoolPage(baseFilters);
    const c = lastCalls();
    expect(has(c, 'eq', 'church_id', 'church-1')).toBe(true);
    expect(has(c, 'is', 'deleted_at', null)).toBe(true);
    expect(has(c, 'eq', 'pending_external_send', false)).toBe(true);
    expect(c.some(x => x[0] === 'or')).toBe(false);
    expect(has(c, 'range', 0, 199)).toBe(true);
  });

  it('fecha de creación filters created_at by Argentina calendar day, inclusive', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { fechaContactoFrom: '2026-09-28', fechaContactoTo: '2026-09-30' } });
    const c = lastCalls();
    expect(has(c, 'gte', 'created_at', '2026-09-28T00:00:00-03:00')).toBe(true);
    expect(has(c, 'lt', 'created_at', '2026-10-01T00:00:00-03:00')).toBe(true);
    expect(c.some(x => x[1] === 'fecha_contacto' && x[0] !== 'order')).toBe(false);
  });

  it('ignores malformed dates instead of sending them', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { fechaContactoFrom: '28/09/2026' } });
    expect(lastCalls().some(x => x[1] === 'created_at')).toBe(false);
  });

  it('sexo, edad and cuerdas', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { sexo: 'Femenino', edadMin: '18', edadMax: '35', cuerdas: ['108', 'MJA Central'] } });
    const c = lastCalls();
    expect(has(c, 'eq', 'sexo', 'Femenino')).toBe(true);
    expect(has(c, 'gte', 'edad', 18)).toBe(true);
    expect(has(c, 'lte', 'edad', 35)).toBe(true);
    expect(has(c, 'in', 'numero_cuerda', ['108', 'MJA Central'])).toBe(true);
  });

  it('legacy single-cuerda tabs still filter', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { cuerda: '201' } });
    expect(has(lastCalls(), 'in', 'numero_cuerda', ['201'])).toBe(true);
  });

  it('estado civil uses a case-insensitive regex that groups DB variants', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { estadoCivil: 'Soltero/a' } });
    expect(has(lastCalls(), 'filter', 'estado_civil', 'imatch', ESTADO_CIVIL_PATTERNS['Soltero/a'])).toBe(true);
    const re = new RegExp(ESTADO_CIVIL_PATTERNS['Soltero/a'], 'i');
    for (const v of ['Soltero', 'Soltera', 'soltera', 'Soltero/a']) expect(re.test(v)).toBe(true);
    expect(re.test('Casado')).toBe(false);
    const pareja = new RegExp(ESTADO_CIVIL_PATTERNS['En pareja'], 'i');
    for (const v of ['En pareja', 'Concubinato', 'novia', 'Con pareja']) expect(pareja.test(v)).toBe(true);
  });

  it('responsable, teléfono, dirección, coordenadas', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { responsable: '__none__', hasPhone: 'no', hasAddress: 'yes', hasCoords: 'yes' } });
    const c = lastCalls();
    expect(has(c, 'is', 'responsable_id', null)).toBe(true);
    expect(has(c, 'is', 'phone', null)).toBe(true);
    expect(has(c, 'not', 'address', 'is', null)).toBe(true);
    expect(has(c, 'not', 'lat', 'is', null)).toBe(true);
  });

  it('pases (MJA received/sent) is the only OR in the query', async () => {
    await fetchPoolPage({ ...baseFilters, tab: { mjaReceived: true } });
    const ors = lastCalls().filter(x => x[0] === 'or');
    expect(ors).toEqual([['or', 'received_from_mja_at.not.is.null,sent_to_mja_at.not.is.null']]);
  });
});

describe('fetchPoolPage — En ruta', () => {
  it("'in' with no live routes short-circuits to empty without querying", async () => {
    const res = await fetchPoolPage({ ...baseFilters, routeFilter: 'in', routeContactIds: [] });
    expect(res).toEqual({ rows: [], totalCount: 0 });
    expect(lastCalls().some(x => x[0] === 'range')).toBe(false);
  });
  it("'in' and 'out' filter by id", async () => {
    await fetchPoolPage({ ...baseFilters, routeFilter: 'in', routeContactIds: ['a', 'b'] });
    expect(has(lastCalls(), 'in', 'id', ['a', 'b'])).toBe(true);
    await fetchPoolPage({ ...baseFilters, routeFilter: 'out', routeContactIds: ['a', 'b'] });
    expect(has(lastCalls(), 'not', 'id', 'in', '(a,b)')).toBe(true);
  });
});

describe('fetchPoolPage — visibility and pages', () => {
  it('scopes non-globals to their cuerda', async () => {
    await fetchPoolPage({ ...baseFilters, userRole: 'referente', canSeeAllCuerdas: false, userCuerda: '204' });
    expect(has(lastCalls(), 'eq', 'numero_cuerda', '204')).toBe(true);
  });
  it('requests the right range for page 3', async () => {
    await fetchPoolPage({ ...baseFilters, page: 2 });
    expect(has(lastCalls(), 'range', 400, 599)).toBe(true);
  });
  it('returns rows and the server count', async () => {
    results = [{ data: [{ id: 'x' }], count: 80, error: null }];
    const res = await fetchPoolPage(baseFilters);
    expect(res).toEqual({ rows: [{ id: 'x' }], totalCount: 80 });
  });
});

describe('fetchPoolAll', () => {
  it('walks 1000-row chunks until a short page', async () => {
    const chunk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
    results = [{ data: chunk(1000), error: null }, { data: chunk(1000), error: null }, { data: chunk(312), error: null }];
    const rows = await fetchPoolAll(baseFilters);
    expect(rows).toHaveLength(2312);
    expect(builds.map(b => b.find(x => x[0] === 'range'))).toEqual([
      ['range', 0, 999], ['range', 1000, 1999], ['range', 2000, 2999],
    ]);
  });
});

describe('dropdown options', () => {
  it('asks the server for distinct values instead of paging rows', async () => {
    rpcResult = { data: ['Mauro', 'ana', null], error: null };
    const vis = { canSeeAllCuerdas: false, userCuerda: '104', userId: 'u1', userRole: 'referente' };
    const res = await fetchDistinctConectores('church-1', vis);
    expect(res).toEqual(['ana', 'Mauro']);
    expect(rpcCalls).toEqual([['get_pool_filter_options', {
      p_church_id: 'church-1', p_kind: 'conector', p_user_role: 'referente',
      p_user_cuerda: '104', p_user_id: 'u1', p_can_see_all: false,
    }]]);
    expect(builds).toHaveLength(0);
  });

  it('sorts cuerdas numerically with named cuerdas last', async () => {
    rpcResult = { data: ['204', 'MJA Central', '104', '1001'], error: null };
    const res = await fetchDistinctCuerdas('church-1', { canSeeAllCuerdas: true, userCuerda: null, userId: 'u1' });
    expect(res).toEqual(['104', '204', '1001', 'MJA Central']);
  });

  it('surfaces RPC errors', async () => {
    rpcResult = { data: null, error: new Error('boom') };
    await expect(fetchDistinctCuerdas('church-1', { canSeeAllCuerdas: true, userCuerda: null, userId: 'u1' })).rejects.toThrow('boom');
  });
});

describe('duplicates', () => {
  it('fetchPoolByIds chunks ids and keeps the other filters', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    results = [{ data: [{ id: 'a' }], error: null }, { data: [{ id: 'b' }], error: null }, { data: [], error: null }];
    const rows = await fetchPoolByIds({ ...baseFilters, tab: { sexo: 'Femenino' } }, ids);
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(builds).toHaveLength(3);
    expect(builds.map(b => (b.find(x => x[0] === 'in' && x[1] === 'id') as any)[2].length)).toEqual([200, 200, 50]);
    for (const b of builds) {
      expect(has(b, 'eq', 'sexo', 'Femenino')).toBe(true);
      expect(b.some(x => x[0] === 'range')).toBe(false);
    }
  });

  it('fetchDuplicateGroups pages past 1000 rows', async () => {
    const page = (n: number, off: number) => Array.from({ length: n }, (_, i) => ({ contact_id: `c${off + i}`, group_no: Math.floor((off + i) / 2) + 1 }));
    rpcQueue = [{ data: page(1000, 0), error: null }, { data: page(256, 1000), error: null }];
    const rows = await fetchDuplicateGroups('church-1', { canSeeAllCuerdas: true, userCuerda: null, userId: 'u1', userRole: 'admin' });
    expect(rows).toHaveLength(1256);
    expect(rpcCalls.map(c => c[0])).toEqual(['get_duplicate_name_groups', 'get_duplicate_name_groups']);
    expect(rpcCalls[0][1]).toMatchObject({ p_church_id: 'church-1', p_can_see_all: true, p_user_role: 'admin' });
  });
});
