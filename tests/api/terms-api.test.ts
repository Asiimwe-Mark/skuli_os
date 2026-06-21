/**
 * Gate tests for GET /api/terms (BUG-C2 fix — new route).
 *
 * This route is the single authoritative source of term data for:
 *   - Dashboard layout (current term)
 *   - Portal context (termIdByStudent)
 *   - Fee accounts page (term filter)
 *   - Marks entry page (term selector)
 *   - Report cards page (term selector)
 *
 * Contract:
 *   1. Requires authentication (401 if unauthenticated)
 *   2. Requires school membership (400 if no school_id)
 *   3. Returns all terms for the school, ordered by created_at DESC
 *   4. Supports ?current_only=true to return only is_current terms
 *   5. Supports ?academic_year_id=uuid to filter by academic year
 *   6. Response is server-cached (x-skuli-cache header present)
 *   7. All roles can read terms (teacher, admin, bursar, parent)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthError } from '@/lib/api-helpers';

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  terms: unknown[];
  cacheHit: boolean;
  queryFilters: Record<string, unknown>;
} = {
  current: null,
  terms: [],
  cacheHit: false,
  queryFilters: {},
};

vi.mock('@/lib/api-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new AuthError('Unauthorized', 401);
      const profile = mockState.current;

      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        mockState.queryFilters[col] = val;
        return chain;
      };
      chain.order = () => chain;
      chain.then = (r: (v: unknown) => void) =>
        Promise.resolve({ data: mockState.terms, error: null }).then(r);

      return {
        supabase: { from: () => chain } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

vi.mock('@/lib/api-cache', () => ({
  withSchoolCache: async (
    _opts: unknown,
    fn: () => Promise<unknown>
  ) => {
    const value = await fn();
    return { value, hit: mockState.cacheHit };
  },
  setCacheHeader: (res: Response, hit: boolean) => {
    const clone = new Response(res.body, res);
    clone.headers.set('x-skuli-cache', hit ? 'hit' : 'miss');
    return clone;
  },
}));

// `@/lib/http` re-exports `respond` and `withSchoolReadCache` from
// `./respond` and `./with-cache`. The test mocks `@/lib/api-cache`
// (which `with-cache.ts` consumes), but `respond.ts` re-exports
// `successResponse` from `@/lib/api-helpers` — which IS the real
// module under this test. So importing through `@/lib/http` exercises
// the same code paths as the production route, just with the cache
// mock substituted. We don't need to mock `@/lib/http` itself.

import { GET } from '@/app/api/terms/route';

function makeRequest(url = 'http://test.local/api/terms') {
  // The new `route()` wrapper reads `req.nextUrl.pathname` on every
  // error path. A bare `new Request(...)` cast does not populate
  // `nextUrl`, so error-path tests would crash inside the wrapper
  // with "Cannot read properties of undefined (reading 'pathname')".
  // Construct a real NextRequest from a real URL instead.
  return new NextRequest(new Request(url, { method: 'GET' }));
}

function setProfile(role = 'SCHOOL_ADMIN', school_id: string | null = 'school-1') {
  mockState.current = { id: 'u-1', school_id, role, full_name: role };
  mockState.terms = [];
  mockState.cacheHit = false;
  mockState.queryFilters = {};
}

const sampleTerms = [
  {
    id: 'term-1',
    name: 'Term1',
    start_date: '2026-01-20',
    end_date: '2026-04-25',
    is_current: true,
    academic_year_id: 'ay-1',
    academic_year: { id: 'ay-1', name: '2026', is_current: true },
  },
  {
    id: 'term-2',
    name: 'Term2',
    start_date: '2026-05-05',
    end_date: '2026-08-15',
    is_current: false,
    academic_year_id: 'ay-1',
    academic_year: { id: 'ay-1', name: '2026', is_current: true },
  },
];

beforeEach(() => {
  setProfile();
});

describe('GET /api/terms', () => {
  it('returns 401 when unauthenticated', async () => {
    mockState.current = null;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when user has no school', async () => {
    setProfile('SCHOOL_ADMIN', null);
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 200 with all terms for the school', async () => {
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
  });

  it('returns empty array when no terms exist', async () => {
    mockState.terms = [];
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it('filters by is_current = true when current_only=true', async () => {
    mockState.terms = [sampleTerms[0]]; // only current term returned
    const res = await GET(makeRequest('http://test.local/api/terms?current_only=true') as never);
    expect(res.status).toBe(200);
    // Verify the query filter was applied
    expect(mockState.queryFilters['is_current']).toBe(true);
  });

  it('does NOT filter by is_current when current_only is absent', async () => {
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    expect(mockState.queryFilters['is_current']).toBeUndefined();
  });

  it('filters by academic_year_id when provided', async () => {
    mockState.terms = sampleTerms;
    const res = await GET(
      makeRequest('http://test.local/api/terms?academic_year_id=ay-1') as never
    );
    expect(res.status).toBe(200);
    expect(mockState.queryFilters['academic_year_id']).toBe('ay-1');
  });

  it('always filters by school_id (tenant scoping)', async () => {
    mockState.terms = sampleTerms;
    await GET(makeRequest() as never);
    expect(mockState.queryFilters['school_id']).toBe('school-1');
  });

  it('always filters by is_deleted = false', async () => {
    mockState.terms = sampleTerms;
    await GET(makeRequest() as never);
    expect(mockState.queryFilters['is_deleted']).toBe(false);
  });

  it('allows TEACHER role to read terms', async () => {
    setProfile('TEACHER', 'school-1');
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
  });

  it('allows BURSAR role to read terms', async () => {
    setProfile('BURSAR', 'school-1');
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
  });

  it('allows PARENT role to read terms (for portal use)', async () => {
    setProfile('PARENT', 'school-1');
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
  });

  it('sets x-skuli-cache: miss on first load', async () => {
    mockState.cacheHit = false;
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.headers.get('x-skuli-cache')).toBe('miss');
  });

  it('sets x-skuli-cache: hit on cached load', async () => {
    mockState.cacheHit = true;
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    expect(res.headers.get('x-skuli-cache')).toBe('hit');
  });

  it('includes academic_year nested object in each term', async () => {
    mockState.terms = sampleTerms;
    const res = await GET(makeRequest() as never);
    const json = await res.json();
    const term = json.data[0];
    expect(term).toHaveProperty('academic_year');
    expect(term.academic_year).toHaveProperty('name');
  });
});
