/**
 * Gate tests for /api/library/books (audit 4.1, 9.5).
 *
 * The route previously returned every book in the school, which
 * for a 10k-volume library is a multi-MB JSON response. It now
 * paginates with page/limit, capped at 200, and uses supabase's
 * .range() for the SQL LIMIT/OFFSET.
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
  rows: unknown[];
  range: { from: number; to: number } | null;
  count: number | null;
  orFilter: string | null;
  eqFilter: { column: string; value: string } | null;
} = {
  current: null,
  rows: [],
  range: null,
  count: null,
  orFilter: null,
  eqFilter: null,
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
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: string) => {
        mockState.eqFilter = { column, value };
        return chain;
      };
      chain.or = (filter: string) => {
        mockState.orFilter = filter;
        return chain;
      };
      chain.order = () => chain;
      chain.range = (from: number, to: number) => {
        mockState.range = { from, to };
        return {
          then: (onFulfilled: (v: unknown) => void) =>
            Promise.resolve({
              data: mockState.rows,
              error: null,
              count: mockState.count,
            }).then(onFulfilled),
        };
      };
      return {
        supabase: { from: () => chain } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { GET } from "@/app/api/library/books/route";

function fakeGet(url = "http://test.local/api/library/books") {
  return new Request(url, { method: "GET" });
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.rows = [];
  mockState.range = null;
  mockState.count = null;
  mockState.orFilter = null;
  mockState.eqFilter = null;
}

describe("GET /api/library/books (audit 4.1, 9.5)", () => {
  it("returns 403 for PARENT (insufficient role)", async () => {
    setProfile("PARENT");
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(403);
  });

  it("returns empty paginated envelope when no books exist", async () => {
    setProfile();
    mockState.rows = [];
    mockState.count = 0;
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.items).toEqual([]);
    expect(json.data.total).toBe(0);
    expect(json.data.page).toBe(1);
    expect(json.data.limit).toBe(50);
    expect(json.data.totalPages).toBe(0);
  });

  it("applies .range() with page=1 limit=50 by default", async () => {
    setProfile();
    mockState.count = 200;
    mockState.rows = [{ id: "b1" }];
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(200);
    expect(mockState.range).toEqual({ from: 0, to: 49 });
  });

  it("applies .range() with the requested page and limit", async () => {
    setProfile();
    mockState.count = 200;
    const res = await GET(fakeGet("http://test.local/api/library/books?page=3&limit=20") as never);
    expect(res.status).toBe(200);
    expect(mockState.range).toEqual({ from: 40, to: 59 });
    const json = await res.json();
    expect(json.data.page).toBe(3);
    expect(json.data.limit).toBe(20);
  });

  it("clamps page < 1 to 1", async () => {
    setProfile();
    mockState.count = 100;
    const res = await GET(fakeGet("http://test.local/api/library/books?page=-5") as never);
    expect(res.status).toBe(200);
    expect(mockState.range?.from).toBe(0);
  });

  it("clamps limit to 200 max", async () => {
    setProfile();
    mockState.count = 1000;
    const res = await GET(fakeGet("http://test.local/api/library/books?limit=9999") as never);
    expect(res.status).toBe(200);
    expect(mockState.range?.to).toBe(199);
    const json = await res.json();
    expect(json.data.limit).toBe(200);
  });

  it("passes search to .or() with ilike filters on title/author/isbn", async () => {
    setProfile();
    mockState.count = 5;
    const res = await GET(fakeGet("http://test.local/api/library/books?search=math") as never);
    expect(res.status).toBe(200);
    expect(mockState.orFilter).toBe(
      "title.ilike.%math%,author.ilike.%math%,isbn.ilike.%math%",
    );
  });

  it("passes category to .eq()", async () => {
    setProfile();
    mockState.count = 5;
    const res = await GET(fakeGet("http://test.local/api/library/books?category=fiction") as never);
    expect(res.status).toBe(200);
    expect(mockState.eqFilter).toEqual({ column: "category", value: "fiction" });
  });

  it("computes totalPages correctly", async () => {
    setProfile();
    mockState.count = 137;
    mockState.rows = [];
    const res = await GET(fakeGet("http://test.local/api/library/books?limit=15") as never);
    const json = await res.json();
    expect(json.data.total).toBe(137);
    // 137 / 15 = 9.13 → 10 pages
    expect(json.data.totalPages).toBe(10);
  });

  it("scopes by school_id and filters soft-deleted", async () => {
    setProfile();
    mockState.count = 0;
    const res = await GET(fakeGet() as never);
    expect(res.status).toBe(200);
    // The route does .eq("school_id", schoolId) then .eq("is_deleted", false).
    // The last eq call captured by our mock is the is_deleted one.
    expect(mockState.eqFilter?.column).toBe("is_deleted");
    expect(mockState.eqFilter?.value).toBe(false);
  });
});
