/**
 * Gate tests for /api/fees/accounts class filter (audit 9.1).
 *
 * Previously the route did an extra round-trip to fetch students in
 * the class, then .in("student_id", ids). It now filters the
 * embedded `students!inner(...)` resource on current_class_id in a
 * single SQL JOIN. This test pins the contract: the classId branch
 * must produce a filter on student.current_class_id (not an extra
 * students SELECT), and must not break the empty-result case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  // capture every call to .eq() so we can assert which filters ran
  eqCalls: { column: string; value: unknown }[];
  // The mock returns this row set when the terminal resolves.
  rows: unknown[];
  count: number | null;
  // The terminal result for the initial students sub-query, if any
  // (used to verify it's NOT called anymore).
  studentsFromCalls: number;
} = {
  current: null,
  eqCalls: [],
  rows: [],
  count: null,
  studentsFromCalls: 0,
};

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
      // Each call to .from(table) returns a fresh chain. The chain
      // records every .eq() and the terminal .range() returns the
      // configured row set.
      const makeChain = () => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (column: string, value: unknown) => {
          mockState.eqCalls.push({ column, value });
          return chain;
        };
        chain.order = () => chain;
        chain.range = () => ({
          then: (onFulfilled: (v: unknown) => void) =>
            Promise.resolve({
              data: mockState.rows,
              error: null,
              count: mockState.count,
            }).then(onFulfilled),
        });
        return chain;
      };
      return {
        supabase: {
          from: (table: string) => {
            // Track if the route still does the extra students round-trip.
            if (table === "students") mockState.studentsFromCalls += 1;
            return makeChain();
          },
        } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { NextRequest } from "next/server";
import { __resetCacheForTests } from "@/lib/api-cache";
import { GET } from "@/app/api/fees/accounts/route";

function fakeGet(url: string) {
  // The new `route()` wrapper reads `req.nextUrl.pathname` on every
  // error path. A bare `new Request(...)` cast does not populate
  // `nextUrl`, so error-path tests would crash inside the wrapper.
  // Build a real NextRequest from a real URL instead.
  return new NextRequest(new Request(url, { method: "GET" }));
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.eqCalls = [];
  mockState.rows = [];
  mockState.count = 0;
  mockState.studentsFromCalls = 0;
}

beforeEach(async () => {
  setProfile();
  await __resetCacheForTests();
});

describe("GET /api/fees/accounts — class filter via SQL JOIN (audit 9.1)", () => {
  const CLASS_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

  it("returns 403 for PARENT", async () => {
    setProfile("PARENT");
    const res = await GET(
      fakeGet(`http://test.local/api/fees/accounts?class_id=${CLASS_UUID}`) as never,
    );
    expect(res.status).toBe(403);
  });

  it("does NOT issue a separate students SELECT to resolve the class filter", async () => {
    setProfile();
    mockState.count = 0;
    const res = await GET(
      fakeGet(`http://test.local/api/fees/accounts?class_id=${CLASS_UUID}`) as never,
    );
    expect(res.status).toBe(200);
    // The audit fix removes the extra round-trip to `students`. The
    // only call we expect is on `fee_accounts`.
    expect(mockState.studentsFromCalls).toBe(0);
  });

  it("emits a student.current_class_id .eq() filter when class_id is set", async () => {
    setProfile();
    mockState.count = 0;
    const res = await GET(
      fakeGet(`http://test.local/api/fees/accounts?class_id=${CLASS_UUID}`) as never,
    );
    expect(res.status).toBe(200);
    const classFilter = mockState.eqCalls.find(
      (c) => c.column === "student.current_class_id",
    );
    expect(classFilter).toEqual({
      column: "student.current_class_id",
      value: CLASS_UUID,
    });
  });

  it("does NOT emit a student.current_class_id filter when class_id is absent", async () => {
    setProfile();
    mockState.count = 0;
    const res = await GET(fakeGet("http://test.local/api/fees/accounts") as never);
    expect(res.status).toBe(200);
    const classFilter = mockState.eqCalls.find(
      (c) => c.column === "student.current_class_id",
    );
    expect(classFilter).toBeUndefined();
  });

  it("returns the standard paginated envelope", async () => {
    setProfile();
    mockState.count = 42;
    mockState.rows = [{ id: "fa1" }];
    const res = await GET(fakeGet("http://test.local/api/fees/accounts") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.items).toEqual([{ id: "fa1" }]);
    expect(json.data.total).toBe(42);
    expect(json.data.page).toBe(1);
    expect(json.data.limit).toBe(50);
    expect(json.data.totalPages).toBe(1);
  });

  it("scopes the query by school_id", async () => {
    setProfile();
    mockState.count = 0;
    await GET(fakeGet("http://test.local/api/fees/accounts") as never);
    const schoolFilter = mockState.eqCalls.find((c) => c.column === "school_id");
    expect(schoolFilter).toEqual({ column: "school_id", value: "s1" });
  });
});
