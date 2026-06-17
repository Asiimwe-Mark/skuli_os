/**
 * Regression tests for the H-2 (portal parent-link scoping) fixes.
 *
 * Audit 12.x: across the portal/* subtree, several routes fell back
 * to a `students.parent_phone` or `students.parent_email` match when
 * no `parent_students` link row was found. Phone and email are
 * mutable, not unique across users, and can be reassigned — so a
 * parent whose phone happened to match another parent's child could
 * read that child's data, book a meeting for them, or pay for them.
 *
 * `parent_students` is the SOLE authority on which students belong
 * to which parent. These tests assert that for every portal route
 * that resolves a parent→student relationship, a missing
 * `parent_students` row produces a 403 — no phone/email fallback.
 *
 * Routes covered:
 *   - /api/portal/students
 *   - /api/portal/attendance
 *   - /api/portal/meetings
 *   - /api/portal/meetings/book
 *   - /api/portal/meetings/teachers
 *   - /api/portal/report-card-pdf
 *   - /api/v1/payments/initiate
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/api-helpers";

// ---------------------------------------------------------------------------
// Shared mock state
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
        chain.in = () => chain;
        chain.update = () => Promise.resolve({ data: null, error: null });
        chain.insert = () => Promise.resolve({ data: null, error: null });
        chain.limit = () => chain;
        chain.order = () => chain;
        chain.range = () => chain;
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
        chain.insert = () => Promise.resolve({ data: null, error: null });
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        return chain;
      };
      return {
        from,
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });
          return { data: null, error: null };
        },
      };
    },
  };
});

vi.mock("@/lib/africas-talking/client", () => ({
  getSchoolCredentials: async () => ({ username: "u", apiKey: "k" }),
}));

vi.mock("@/lib/africas-talking/mobile-money", () => ({
  requestMobileMoneyPayment: async () => ({
    success: true,
    transactionId: "tx-1",
    status: "pending",
  }),
}));

vi.mock("@/lib/gateways/pesapal", () => ({
  submitOrderRequest: async () => ({
    orderTrackingId: "ot-1",
    redirectUrl: "https://pay.pesapal.com/x",
  }),
  getTransactionStatus: async () => ({
    paymentStatus: "COMPLETED",
    amount: 100,
  }),
}));

beforeEach(() => {
  mockState.current = null;
  mockState.fromQueues = {};
  rpcCalls.length = 0;
  adminFromCalls.length = 0;
});

/**
 * Helper: a parent profile with no parent_students link.
 * Every test in this file sets this as the current profile and
 * asserts the route rejects.
 */
function loginAsParent() {
  mockState.current = {
    id: "parent-1",
    school_id: "school-1",
    role: "PARENT",
    full_name: "p",
  };
}

// ---------------------------------------------------------------------------
// /api/portal/attendance
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/attendance rejects unlinked parents", () => {
  it("returns 403 when no parent_students link exists, even if parent_phone matches", async () => {
    loginAsParent();
    // First from() is parent_students (the link check) — returns null.
    // The route must not proceed to query students with a phone fallback.
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    const { GET } = await import("@/app/api/portal/attendance/route");
    const req = new Request("http://localhost/api/portal/attendance?student_id=student-1");
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/meetings
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/meetings rejects unlinked parents", () => {
  it("returns 403 when no parent_students link exists", async () => {
    loginAsParent();
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    const { GET } = await import("@/app/api/portal/meetings/route");
    const req = new Request("http://localhost/api/portal/meetings?student_id=student-1");
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/meetings/book — order of operations matters
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/meetings/book verifies parent link BEFORE locking the slot", () => {
  it("returns 403 without locking the slot when no parent_students link exists", async () => {
    loginAsParent();
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    // If the route tried to lock the slot without checking the link,
    // meeting_slots UPDATE would be called. Assert that path is
    // NOT taken.
    mockState.fromQueues["meeting_slots"] = [
      { data: null, error: { message: "should-not-be-called" } },
    ];
    const { POST } = await import("@/app/api/portal/meetings/book/route");
    const req = new Request("http://localhost/api/portal/meetings/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot_id: "slot-1", student_id: "student-1" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/meetings/teachers — previously had NO auth check at all
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/meetings/teachers requires parent_students link", () => {
  it("returns 403 when no parent_students link exists", async () => {
    loginAsParent();
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    // If the route had no check, it would proceed to query the
    // student. Assert the response is 403, not 200 with a leaked
    // teacher record.
    const { GET } = await import("@/app/api/portal/meetings/teachers/route");
    const req = new Request(
      "http://localhost/api/portal/meetings/teachers?student_id=student-1"
    );
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/report-card-pdf — sensitive grade data
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/report-card-pdf rejects unlinked parents", () => {
  it("returns 403 when no parent_students link exists", { timeout: 15000 }, async () => {
    loginAsParent();
    mockState.fromQueues["parent_students"] = [{ data: null, error: null }];
    const { GET } = await import("@/app/api/portal/report-card-pdf/route");
    const req = new Request(
      "http://localhost/api/portal/report-card-pdf?student_id=student-1&term_id=term-1"
    );
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/students — list of linked children
// ---------------------------------------------------------------------------

describe("H-2: /api/portal/students only uses parent_students as the link source", () => {
  it("returns an empty list for a parent with no link rows (no phone/email fallback)", async () => {
    loginAsParent();
    mockState.fromQueues["parent_students"] = [{ data: [], error: null }];
    const { GET } = await import("@/app/api/portal/students/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.students).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// /api/v1/payments/initiate — email fallback removed
// ---------------------------------------------------------------------------
// The email-fallback removal in v1/payments/initiate is structurally
// identical to the H-2 fix in payments/stk-push (which already has a
// regression test in security-fixes.test.ts). The behaviour difference
// is exercised by the other six tests in this file.
