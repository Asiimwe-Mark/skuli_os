/**
 * Gate tests for the role guards added in Phase 1 (audit 4.1, 4.2).
 *
 * These pin the response shape that PARENT and BURSAR get from the
 * timetable endpoints. Before Phase 1, a PARENT with no school_id got
 * a 400 ("no school associated") and a BURSAR got through. After
 * Phase 1, both get 403 from `requireRole` — clean, contract-correct
 * 403s, not 400s and not 500s.
 */
import { describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/api-helpers";

// Mutable state the mock closes over. Each test sets this before calling
// the handler so we exercise the same code path with different roles.
type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};
const mockState: { current: Profile | null } = { current: null };

// vi.mock is hoisted by the vitest transformer, so the route file sees
// this mock the moment it imports `getSupabaseAndUser`. The mock
// delegates `requireRole`/`requireSchool`/`dbError` to the real module
// so the test exercises the real authorization logic — only the data
// source is fake.
vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) {
        throw new AuthError("test not configured", 500);
      }
      const profile = mockState.current;
      // Build a supabase-shaped stub good enough for the route's
      // post-authorization read. Returns an empty list so the happy
      // path returns 200 with `{ success: true, data: [] }`.
      const chain = {
        from: () => chain,
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: undefined as never,
      };
      return {
        supabase: chain as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

// Import the route handlers AFTER the mock is registered.
import { GET as periodsGET } from "@/app/api/timetable/periods/route";
import { GET as slotsGET } from "@/app/api/timetable/slots/route";

function fakeRequest(url = "http://test.local/") {
  return new Request(url, { method: "GET" });
}

function setProfile(role: string, school_id: string | null = "s1"): Profile {
  const p: Profile = {
    id: "u1",
    school_id,
    role,
    full_name: role,
  };
  mockState.current = p;
  return p;
}

describe("GET /api/timetable/periods — role guard (audit 4.1)", () => {
  it("returns 403 when called as PARENT", async () => {
    setProfile("PARENT");
    const res = await periodsGET(fakeRequest() as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 403 when called as BURSAR", async () => {
    setProfile("BURSAR");
    const res = await periodsGET(fakeRequest() as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when called as SCHOOL_ADMIN with no school_id (audit 2.3)", async () => {
    setProfile("SCHOOL_ADMIN", null);
    const res = await periodsGET(fakeRequest() as never);
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty array when called as SCHOOL_ADMIN (happy path)", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await periodsGET(fakeRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe("GET /api/timetable/slots — role guard (audit 4.2)", () => {
  it("returns 403 when called as PARENT", async () => {
    setProfile("PARENT");
    const res = await slotsGET(fakeRequest() as never);
    expect(res.status).toBe(403);
  });
});
