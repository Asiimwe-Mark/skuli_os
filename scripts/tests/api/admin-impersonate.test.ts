/**
 * Regression tests for app/api/admin/impersonate/route.ts.
 *
 * Impersonation lets a SUPER_ADMIN log in as a school's admin via
 * a magic link. Every successful call must:
 *   1. Require SUPER_ADMIN role (no other role is allowed).
 *   2. Verify the target school exists and is not soft-deleted.
 *   3. Find an active SCHOOL_ADMIN for that school.
 *   4. Generate a magic link via Supabase Auth admin API.
 *   5. Write an audit log capturing who impersonated, whom, and
 *      which school.
 *   6. Return the magic-link URL for the operator to open in a new
 *      tab. The link expires in 1h.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  school: { id: string; name: string; is_deleted: boolean } | null;
  schoolAdmin: { id: string; full_name: string; role: string } | null;
  authUser: { user: { email: string } } | null;
  linkData:
    | { properties: { action_link: string } }
    | { error: { message: string } }
    | null;
  linkError: { message: string } | null;
  auditInserts: Array<Record<string, unknown>>;
} = {
  current: null,
  school: null,
  schoolAdmin: null,
  authUser: null,
  linkData: { properties: { action_link: "https://supabase/auth/magic?token=abc" } },
  linkError: null,
  auditInserts: [],
};

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new (await actual).AuthError("Unauthorized", 401);
      return {
        supabase: {} as never,
        user: { id: mockState.current.id, email: "super@admin.com" } as never,
        profile: mockState.current,
      };
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => chain;
      chain.insert = (row: Record<string, unknown>) => {
        if (table === "audit_logs") mockState.auditInserts.push(row);
        return Promise.resolve({ data: null, error: null });
      };
      chain.single = async () => {
        if (table === "schools") {
          return { data: mockState.school, error: mockState.school ? null : { message: "not found" } };
        }
        if (table === "users") {
          return { data: mockState.schoolAdmin, error: mockState.schoolAdmin ? null : { message: "not found" } };
        }
        return { data: null, error: null };
      };
      return chain;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: mockState.authUser, error: null }),
        generateLink: async () => ({ data: mockState.linkData, error: mockState.linkError }),
      },
    },
  }),
}));

beforeEach(() => {
  mockState.current = {
    id: "super-1",
    school_id: null,
    role: "SUPER_ADMIN",
    full_name: "Root",
  };
  mockState.school = { id: "sc-1", name: "Test School", is_deleted: false };
  mockState.schoolAdmin = { id: "admin-1", full_name: "School Admin", role: "SCHOOL_ADMIN" };
  mockState.authUser = { user: { email: "admin@school.com" } };
  mockState.linkData = { properties: { action_link: "https://supabase/auth/magic?token=abc" } };
  mockState.linkError = null;
  mockState.auditInserts = [];
});

describe("POST /api/admin/impersonate", () => {
  it("rejects unauthenticated callers with 401", { timeout: 15000 }, async () => {
    mockState.current = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("rejects non-SUPER_ADMIN callers with 403", { timeout: 15000 }, async () => {
    mockState.current = {
      id: "u-1",
      school_id: "sc-1",
      role: "SCHOOL_ADMIN",
      full_name: "x",
    };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when school_id is missing", async () => {
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the school is not found", async () => {
    mockState.school = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "ghost" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the school is soft-deleted", async () => {
    mockState.school = { id: "sc-1", name: "X", is_deleted: true };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when no active school admin is found", async () => {
    mockState.schoolAdmin = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 500 when the auth user has no email", async () => {
    mockState.authUser = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("returns 500 when generateLink fails", async () => {
    mockState.linkData = { error: { message: "rate limited" } };
    mockState.linkError = { message: "rate limited" };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("returns 200 with the magic link and writes an audit log on success", async () => {
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new Request("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ school_id: "sc-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe("https://supabase/auth/magic?token=abc");
    expect(body.data.target_user.id).toBe("admin-1");
    expect(body.data.school.name).toBe("Test School");
    // Audit log records WHO impersonated WHOM, with school context.
    expect(mockState.auditInserts).toHaveLength(1);
    expect(mockState.auditInserts[0].action).toBe("impersonation_initiated");
    expect(mockState.auditInserts[0].user_id).toBe("super-1");
    expect(mockState.auditInserts[0].school_id).toBe("sc-1");
  });
});
