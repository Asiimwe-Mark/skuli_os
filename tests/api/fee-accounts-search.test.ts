/**
 * Gate tests for /api/fees/accounts/search (audit 4.4, 9.9).
 *
 * The "Record Payment" page used to load every fee account in the
 * term in one query. The new search endpoint caps the row count
 * and pushes the ilike to the database.
 */
import { describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  feeAccountRows: unknown[];
  matchedStudentIds: string[] | null;
  inFilter: { column: string; ids: string[] } | null;
  limitCap: number | null;
} = {
  current: null,
  feeAccountRows: [],
  matchedStudentIds: null,
  inFilter: null,
  limitCap: null,
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

      // Two query shapes: students (when q is set) and fee_accounts
      // (always).
      const studentsChain: Record<string, unknown> = {};
      studentsChain.select = () => studentsChain;
      studentsChain.eq = () => studentsChain;
      studentsChain.or = () => studentsChain;
      studentsChain.limit = (n: number) => {
        return {
          then: (onFulfilled: (v: unknown) => void) => {
            const ids = mockState.matchedStudentIds ?? [];
            return Promise.resolve({
              data: ids.map((id) => ({ id })),
              error: null,
            }).then(onFulfilled);
          },
        };
      };

      const feeChain: Record<string, unknown> = {};
      feeChain.select = () => feeChain;
      feeChain.eq = () => feeChain;
      feeChain.order = () => feeChain;

      // Helper: build a thenable chain that's also chainable for
      // both .in() and .limit(). The supabase-js client lets you
      // call any of these at any time before the terminal await.
      const makeChain = (): Record<string, unknown> => {
        const c: Record<string, unknown> = {};
        c.in = (column: string, ids: string[]) => {
          mockState.inFilter = { column, ids };
          return c;
        };
        c.limit = (n: number) => {
          mockState.limitCap = n;
          return c;
        };
        c.then = (onFulfilled: (v: unknown) => void) =>
          Promise.resolve({
            data: mockState.feeAccountRows,
            error: null,
          }).then(onFulfilled);
        return c;
      };

      // The initial chain and the chains returned by .limit() all
      // share the same shape (in + limit + then).
      const sharedChain = makeChain();
      feeChain.in = sharedChain.in;
      feeChain.limit = (n: number) => {
        mockState.limitCap = n;
        return sharedChain;
      };

      return {
        supabase: {
          from: (table: string) => {
            if (table === "students") return studentsChain;
            return feeChain;
          },
        } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { GET } from "@/app/api/fees/accounts/search/route";
import { NextRequest } from "next/server";

function fakeGet(url = "http://test.local/api/fees/accounts/search") {
  // The new `route()` wrapper reads `req.nextUrl.pathname` on every
  // error path. A bare `new Request(...)` cast does not populate
  // `nextUrl`, so error-path tests would crash inside the wrapper.
  // Build a real NextRequest from a real URL instead.
  return new NextRequest(new Request(url, { method: "GET" }));
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.feeAccountRows = [];
  mockState.matchedStudentIds = null;
  mockState.inFilter = null;
  mockState.limitCap = null;
}

describe("GET /api/fees/accounts/search (audit 4.4, 9.9)", () => {
  it("returns 403 for PARENT (insufficient role)", async () => {
    setProfile("PARENT");
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(403);
  });

  it("returns empty list when there are no fee accounts", async () => {
    setProfile();
    mockState.feeAccountRows = [];
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.students).toEqual([]);
  });

  it("caps results at the requested limit (caller requests 20, max 50)", async () => {
    setProfile();
    mockState.feeAccountRows = [
      { id: "fa1", balance: 100, student: { id: "st1", full_name: "A", admission_number: "001" } },
    ];
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?limit=20") as never);
    expect(res.status).toBe(200);
    expect(mockState.limitCap).toBe(20);
  });

  it("rejects limit > 50 (defensive cap)", async () => {
    setProfile();
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?limit=200") as never);
    expect(res.status).toBe(400);
  });

  it("rejects negative limit", async () => {
    setProfile();
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?limit=-1") as never);
    expect(res.status).toBe(400);
  });

  it("with a search query, runs an .in() filter on the matched student ids", async () => {
    setProfile();
    mockState.matchedStudentIds = ["s1", "s2"];
    mockState.feeAccountRows = [
      {
        id: "fa1",
        balance: 100,
        student: {
          id: "s1",
          full_name: "Alice",
          admission_number: "A1",
          parent_phone: "+256700000001",
          current_class: { name: "P5" },
        },
      },
      {
        id: "fa2",
        balance: 50,
        student: {
          id: "s2",
          full_name: "Bob",
          admission_number: "A2",
          parent_phone: "+256700000002",
          current_class: { name: "P6" },
        },
      },
    ];
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?q=ali") as never);
    expect(res.status).toBe(200);
    expect(mockState.inFilter).not.toBeNull();
    expect(mockState.inFilter?.column).toBe("student_id");
    expect(mockState.inFilter?.ids.sort()).toEqual(["s1", "s2"]);
  });

  it("with a search query that matches no students, returns empty list without calling fee_accounts", async () => {
    setProfile();
    mockState.matchedStudentIds = [];
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?q=zzznoresult") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.students).toEqual([]);
    // The .in() filter was not applied because we short-circuited.
    expect(mockState.inFilter).toBeNull();
  });

  it("rejects invalid term_id (non-UUID)", async () => {
    setProfile();
    const res = await GET(fakeGet("http://test.local/api/fees/accounts/search?term_id=notauuid") as never);
    expect(res.status).toBe(400);
  });

  it("normalises the returned shape: balance, full_name, fee_account_id", async () => {
    setProfile();
    mockState.feeAccountRows = [
      {
        id: "fa-uuid",
        balance: 5000,
        student: {
          id: "st-uuid",
          full_name: "Jane Doe",
          admission_number: "ADM-001",
          parent_phone: "+256700000000",
          current_class: { name: "P5" },
        },
      },
    ];
    const res = await GET(fakeGet() as never);
    const json = await res.json();
    expect(json.data.students[0]).toEqual({
      id: "st-uuid",
      full_name: "Jane Doe",
      admission_number: "ADM-001",
      balance: 5000,
      fee_account_id: "fa-uuid",
      class_name: "P5",
      parent_phone: "+256700000000",
    });
  });
});
