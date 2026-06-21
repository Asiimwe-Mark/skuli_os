/**
 * Regression tests for app/api/admin/impersonate/route.ts.
 *
 * Impersonation lets a SUPER_ADMIN take a scoped, server-controlled
 * session on behalf of a school's admin. Every successful call must:
 *   1. Require SUPER_ADMIN role (no other role is allowed).
 *   2. Verify the target school exists and is not soft-deleted.
 *   3. Find an active SCHOOL_ADMIN for that school.
 *   4. Mint a short-lived session in `impersonation_sessions` with a
 *      SHA-256-hashed token; only the prefix is ever surfaced.
 *   5. Write an audit log capturing who impersonated, whom, and
 *      which school.
 *   6. Set the impersonation cookie and return the session metadata
 *      to the operator.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

interface SessionInsertCall {
  row: Record<string, unknown>;
}

const mockState: {
  current: Profile | null;
  school: { id: string; name: string; is_deleted: boolean } | null;
  schoolAdmin: { id: string; full_name: string; role: string } | null;
  sessionInsertError: { message: string } | null;
  sessionInserts: SessionInsertCall[];
  auditInserts: Array<Record<string, unknown>>;
  cookieSet: { name: string; value: string } | null;
} = {
  current: null,
  school: null,
  schoolAdmin: null,
  sessionInsertError: null,
  sessionInserts: [],
  auditInserts: [],
  cookieSet: null,
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
      chain.maybeSingle = async () => {
        if (table === "schools") {
          return { data: mockState.school, error: mockState.school ? null : { message: "not found" } };
        }
        if (table === "users") {
          return { data: mockState.schoolAdmin, error: mockState.schoolAdmin ? null : { message: "not found" } };
        }
        return { data: null, error: null };
      };
      chain.insert = (row: Record<string, unknown>) => {
        if (table === "impersonation_sessions") {
          mockState.sessionInserts.push({ row });
          if (mockState.sessionInsertError) {
            return Promise.resolve({ data: null, error: mockState.sessionInsertError });
          }
          // Mimic the real `.insert().select().single()` chain by
          // resolving to a row that contains the metadata fields
          // the route reads back.
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "session-1",
                  school_id: row.school_id,
                  target_user_id: row.target_user_id,
                  actor_user_id: row.actor_user_id,
                  reason: row.reason,
                  expires_at: row.expires_at,
                  token_prefix: row.token_prefix,
                },
                error: null,
              }),
            }),
          };
        }
        if (table === "audit_logs") {
          mockState.auditInserts.push(row);
        }
        return Promise.resolve({ data: null, error: null });
      };
      return chain;
    },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (cookie: { name: string; value: string }) => {
      mockState.cookieSet = cookie;
    },
    get: () => undefined,
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
  mockState.sessionInsertError = null;
  mockState.sessionInserts = [];
  mockState.auditInserts = [];
  mockState.cookieSet = null;
});

describe("POST /api/admin/impersonate", () => {
  it("rejects unauthenticated callers with 401", async () => {
    mockState.current = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  }, 15000);

  it("rejects non-SUPER_ADMIN callers with 403", async () => {
    mockState.current = {
      id: "u-1",
      school_id: "sc-1",
      role: "SCHOOL_ADMIN",
      full_name: "x",
    };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when school_id is missing", async () => {
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the school is not found", async () => {
    mockState.school = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "ghost", reason: "support ticket #42" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the school is soft-deleted", async () => {
    mockState.school = { id: "sc-1", name: "X", is_deleted: true };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1", reason: "support ticket #42" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when no active school admin is found", async () => {
    mockState.schoolAdmin = null;
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1", reason: "support ticket #42" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the reason is missing", async () => {
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 500 when the session insert fails", async () => {
    mockState.sessionInsertError = { message: "db down" };
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1", reason: "support ticket #42" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("returns 200 with a session_id and writes an audit log on success", async () => {
    const { POST } = await import("@/app/api/admin/impersonate/route");
    const req = new NextRequest(
      new Request("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: "sc-1", reason: "support ticket #42" }),
      }),
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.session_id).toBe("session-1");
    expect(body.data.token_prefix).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(body.data.target_user.id).toBe("admin-1");
    expect(body.data.school.name).toBe("Test School");
    // The session row's token_hash must be set; the plaintext token
    // is never written.
    expect(mockState.sessionInserts).toHaveLength(1);
    expect(mockState.sessionInserts[0].row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    // The session row's school_id and target_user_id come from the
    // looked-up school + admin.
    expect(mockState.sessionInserts[0].row.school_id).toBe("sc-1");
    expect(mockState.sessionInserts[0].row.target_user_id).toBe("admin-1");
    // The impersonation cookie is set; value is the raw token, not the hash.
    expect(mockState.cookieSet?.name).toBe("sk_impersonation");
    expect(mockState.cookieSet?.value).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // Audit log records WHO impersonated WHOM, with school context.
    expect(mockState.auditInserts).toHaveLength(1);
    expect(mockState.auditInserts[0].action).toBe("impersonation_started");
    expect(mockState.auditInserts[0].user_id).toBe("super-1");
    expect(mockState.auditInserts[0].school_id).toBe("sc-1");
  });
});
