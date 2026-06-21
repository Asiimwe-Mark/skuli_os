/**
 * Regression tests for the 2026-06-06 security audit fixes.
 *
 * H-1: /api/referral/apply must require an authenticated SUPER_ADMIN
 *      session. Unauthenticated callers are rejected before any RPC.
 * H-2: /api/payments/stk-push must deny PARENT callers that have no
 *      parent_students link to the target student. The phone-number
 *      fallback has been removed.
 * M-5: /api/auth/callback redirects to /login on any failure —
 *      network throw, missing code, exchangeCodeForSession error.
 * M-4: production CSP must not include 'unsafe-eval'. Dev CSP may.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthError } from "@/lib/api-helpers";

// ---------------------------------------------------------------------------
// Shared mock state — every test sets up the profile + from() queues it needs.
// ---------------------------------------------------------------------------

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  fromQueues: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
} = {
  current: null,
  fromQueues: {},
};

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const adminFromCalls: string[] = [];
const auditLogInserts: Array<Record<string, unknown>> = [];

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new AuthError("Unauthorized", 401);
      const profile = mockState.current;
      const from = (table: string) => {
        const queue = mockState.fromQueues[table] ?? [];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.insert = () => Promise.resolve({ data: null, error: null });
        chain.limit = () => chain;
        chain.single = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        return chain;
      };
      return {
        supabase: { from, rpc: async () => ({ data: null, error: null }) },
        user: { id: profile.id, email: "test@example.com" } as never,
        profile,
      };
    },
  };
});

vi.mock("@/lib/supabase/admin", async () => {
  return {
    createAdminClient: () => {
      const from = (table: string) => {
        adminFromCalls.push(table);
        const queue = mockState.fromQueues[table] ?? [];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.insert = (row: Record<string, unknown>) => {
          if (table === "audit_logs") auditLogInserts.push(row);
          return Promise.resolve({ data: null, error: null });
        };
        return chain;
      };
      return {
        from,
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });
          const queue = mockState.fromQueues[`rpc:${fn}`] ?? [];
          const next = queue.shift();
          return next ?? { data: null, error: null };
        },
      };
    },
  };
});

// Mock the heavy dependencies we don't want to actually invoke.
vi.mock("@/lib/africas-talking/client", () => ({
  getSchoolCredentials: async () => ({
    username: "u",
    apiKey: "k",
    senderId: "SKULI",
  }),
}));
vi.mock("@/lib/africas-talking/mobile-money", () => ({
  requestMobileMoneyPayment: async () => ({
    success: true,
    transactionId: "tx-1",
    status: "pending",
    description: "ok",
  }),
}));

beforeEach(() => {
  mockState.current = null;
  mockState.fromQueues = {};
  rpcCalls.length = 0;
  adminFromCalls.length = 0;
  auditLogInserts.length = 0;
});

// ---------------------------------------------------------------------------
// H-1: /api/referral/apply must reject unauthenticated callers
// ---------------------------------------------------------------------------

describe("H-1: /api/referral/apply auth gate", () => {
  it("rejects unauthenticated callers with 401", async () => {
    mockState.current = null;
    const { POST } = await import("@/app/api/referral/apply/route");
    const req = new Request("http://localhost/api/referral/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referral_code: "ABC123", new_school_id: "x" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects non-SUPER_ADMIN authenticated callers with 403", async () => {
    mockState.current = {
      id: "u1",
      school_id: "s1",
      role: "SCHOOL_ADMIN",
      full_name: "x",
    };
    const { POST } = await import("@/app/api/referral/apply/route");
    const req = new Request("http://localhost/api/referral/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referral_code: "ABC123",
        new_school_id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("calls apply_referral_credit only after a SUPER_ADMIN session and writes an audit log", async () => {
    mockState.current = {
      id: "u1",
      school_id: null,
      role: "SUPER_ADMIN",
      full_name: "Asiimwe",
    };
    mockState.fromQueues["schools"] = [{ data: { id: "school-1" }, error: null }];
    mockState.fromQueues["rpc:apply_referral_credit"] = [
      { data: { credited: true }, error: null },
    ];
    const { POST } = await import("@/app/api/referral/apply/route");
    const req = new Request("http://localhost/api/referral/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referral_code: "ABC123",
        new_school_id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("apply_referral_credit");
    expect(auditLogInserts).toHaveLength(1);
    expect(auditLogInserts[0].action).toBe("REFERRAL_APPLIED");
  });
});

// ---------------------------------------------------------------------------
// H-2: /api/payments/stk-push must not fall back to phone-number matching
// ---------------------------------------------------------------------------

describe("H-2: /api/payments/stk-push parent IDOR", () => {
  it("denies a PARENT caller with no parent_students link, even when phones match", async () => {
    mockState.current = {
      id: "parent-1",
      school_id: "school-1",
      role: "PARENT",
      full_name: "p",
    };
    mockState.fromQueues["students"] = [
      {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          full_name: "Kid",
          parent_phone: "+256700000001",
          school_id: "school-1",
        },
        error: null,
      },
    ];
    // No parent_students link present.
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    const { POST } = await import("@/app/api/payments/stk-push/route");
    const req = new Request("http://localhost/api/payments/stk-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ student_id: "11111111-1111-4111-8111-111111111111", amount: 1000 }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/own children/i);
  });

  it("allows a PARENT caller WITH a parent_students link", async () => {
    mockState.current = {
      id: "parent-1",
      school_id: "school-1",
      role: "PARENT",
      full_name: "p",
    };
    mockState.fromQueues["students"] = [
      {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          full_name: "Kid",
          parent_phone: "+256700000001",
          school_id: "school-1",
        },
        error: null,
      },
    ];
    mockState.fromQueues["parent_students"] = [
      { data: { student_id: "11111111-1111-4111-8111-111111111111" }, error: null },
    ];
    mockState.fromQueues["terms"] = [
      { data: { id: "term-1", name: "Term 1" }, error: null },
    ];
    mockState.fromQueues["fee_accounts"] = [
      { data: { id: "fa-1" }, error: null },
    ];
    const { POST } = await import("@/app/api/payments/stk-push/route");
    const req = new Request("http://localhost/api/payments/stk-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ student_id: "11111111-1111-4111-8111-111111111111", amount: 1000 }),
    });
    const res = await POST(req as never);
    if (res.status !== 200) {
      const body = await res.clone().json();
      throw new Error(
        `Expected 200, got ${res.status}: ${JSON.stringify(body)}`
      );
    }
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// M-5: /api/auth/callback must redirect on any failure
// ---------------------------------------------------------------------------

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

describe("M-5: /api/auth/callback error handling", () => {
  it("redirects to /login?error=... when no code is present", async () => {
    const { GET } = await import("@/app/api/auth/callback/route");
    const req = new Request("http://localhost/api/auth/callback");
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/error=auth_callback_failed/);
  });

  it("redirects to /login?error=... when exchangeCodeForSession throws", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockImplementationOnce(
      () =>
        ({
          auth: {
            exchangeCodeForSession: async () => {
              throw new Error("network down");
            },
          },
        }) as never
    );
    const { GET } = await import("@/app/api/auth/callback/route");
    const req = new Request("http://localhost/api/auth/callback?code=abc");
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/error=auth_callback_failed/);
  });

  it("redirects to /login?error=... when exchangeCodeForSession returns an error", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockImplementationOnce(
      () =>
        ({
          auth: {
            exchangeCodeForSession: async () => ({
              error: { message: "bad code" },
            }),
          },
        }) as never
    );
    const { GET } = await import("@/app/api/auth/callback/route");
    const req = new Request("http://localhost/api/auth/callback?code=abc");
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/error=auth_callback_failed/);
  });

  it("redirects to the requested `next` path on success", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockImplementationOnce(
      () =>
        ({
          auth: {
            exchangeCodeForSession: async () => ({ error: null }),
          },
        }) as never
    );
    const { GET } = await import("@/app/api/auth/callback/route");
    const req = new Request(
      "http://localhost/api/auth/callback?code=abc&next=/dashboard/fees"
    );
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/dashboard/fees"
    );
  });
});

// ---------------------------------------------------------------------------
// M-4: production CSP must not include 'unsafe-eval'
// ---------------------------------------------------------------------------

describe("M-4: production CSP strips unsafe-eval", () => {
  it("omits 'unsafe-eval' from script-src when NODE_ENV=production", () => {
    // We can't mutate the module after import, so we read the source
    // and confirm the conditional is wired correctly. The actual
    // runtime check happens in the headers() callback.
    const src = readFileSync(
      join(process.cwd(), "next.config.ts"),
      "utf8"
    );
    expect(src).toMatch(/isDev\s*=\s*process\.env\.NODE_ENV\s*!==\s*'production'/);
    // The unsafe-eval token is now gated on isDev, not always-on.
    // Use [\s\S] instead of the `s` (dotall) flag for tsconfig
    // compatibility (the project targets es2017 where `s` is unavailable).
    expect(src).toMatch(/'unsafe-eval'[\s\S]*isDev/);
  });
});
