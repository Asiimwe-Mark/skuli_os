/**
 * Regression tests for app/api/v1/payroll/approve/route.ts.
 *
 * This route turns a list of pending payroll_records into a single
 * Pesapal funding batch. It is the gate between "payroll calculated"
 * and "real money moves" — bugs here are the most expensive kind.
 *
 * Contract:
 *   1. Auth: SCHOOL_ADMIN / BURSAR / SUPER_ADMIN only.
 *   2. Records are scoped to the caller's school_id — a tenant
 *      cannot fund another tenant's payroll.
 *   3. Records must be status='pending'. Already-paid records are
 *      silently skipped (no double funding).
 *   4. The route snapshots each staff's payment profile so live
 *      profile edits cannot redirect funds.
 *   5. The Pesapal redirect URL is the response — the school admin
 *      uses it to complete the actual funding.
 *   6. Rate limit: 3 batches per school per 10 min. Over the limit
 *      returns 429.
 *   7. Validation: at least 1 record, at most 500, valid funding
 *      mechanism.
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
  fromQueues: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
  insertCalls: Array<{ table: string; data: unknown }>;
  updateCalls: Array<{ table: string; data: unknown }>;
  deleteCalls: Array<{ table: string; filter: string }>;
  rateLimitSuccess: boolean;
  submittedOrder: unknown;
} = {
  current: null,
  fromQueues: {},
  insertCalls: [],
  updateCalls: [],
  deleteCalls: [],
  rateLimitSuccess: true,
  submittedOrder: {
    orderTrackingId: "ot-1",
    redirectUrl: "https://pay.pesapal.com/checkout/abc",
  },
};

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new (await actual).AuthError("Unauthorized", 401);
      const profile = mockState.current;
      const from = (table: string) => {
        const queue = mockState.fromQueues[table] ?? [];
        let mode: "select" | "insert" | "delete" = "select";
        let capturedData: unknown = null;
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.single = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.insert = (data: unknown) => {
          mode = "insert";
          capturedData = data;
          return chain;
        };
        chain.delete = () => {
          mode = "delete";
          return chain;
        };
        chain.update = (data: unknown) => {
          mockState.updateCalls.push({ table, data });
          return chain;
        };
        chain.then = (onFulfilled: (v: unknown) => unknown) => {
          if (mode === "insert") {
            mockState.insertCalls.push({ table, data: capturedData });
            return Promise.resolve({ data: null, error: null }).then(
              onFulfilled
            );
          }
          if (mode === "delete") {
            mockState.deleteCalls.push({ table, filter: "any" });
            return Promise.resolve({ data: null, error: null }).then(
              onFulfilled
            );
          }
          // Multiple queue entries in `.in()` style — pop one
          const next = queue.shift() ?? { data: null, error: null };
          return Promise.resolve(next).then(onFulfilled);
        };
        return chain;
      };
      return {
        supabase: { from },
        user: { id: profile.id, email: "admin@school.com" } as never,
        profile,
      };
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/gateways/pesapal", () => ({
  submitOrderRequest: async () => mockState.submittedOrder,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimitAsync: async () => ({
    success: mockState.rateLimitSuccess,
    resetAt: Date.now() + 60_000,
  }),
}));

beforeEach(() => {
  mockState.current = null;
  mockState.fromQueues = {};
  mockState.insertCalls = [];
  mockState.updateCalls = [];
  mockState.deleteCalls = [];
  mockState.rateLimitSuccess = true;
  mockState.submittedOrder = {
    orderTrackingId: "ot-1",
    redirectUrl: "https://pay.pesapal.com/checkout/abc",
  };
});

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: "u-1",
    school_id: "sc-1",
    role: "SCHOOL_ADMIN",
    full_name: "Admin",
    ...over,
  };
}

describe("POST /api/v1/payroll/approve", () => {
  it("rejects unauthenticated callers with 401", async () => {
    mockState.current = null;
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 429 when the school is over the rate limit", async () => {
    mockState.current = makeProfile();
    mockState.rateLimitSuccess = false;
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(429);
    expect(mockState.insertCalls).toHaveLength(0); // no batch created
  });

  it("returns 400 on invalid funding_mechanism", async () => {
    mockState.current = makeProfile();
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "BITCOIN",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty payroll_record_ids", async () => {
    mockState.current = makeProfile();
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: [],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when no eligible records are found", async () => {
    mockState.current = makeProfile();
    mockState.fromQueues["payroll_records"] = [{ data: [], error: null }];
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 400 when Pesapal is not configured for the school", async () => {
    mockState.current = makeProfile();
    mockState.fromQueues["payroll_records"] = [
      { data: [{ id: "r-1", staff_id: "s-1", net_salary: 500000, basic_salary: 500000, allowances: 0, deductions: 0 }], error: null },
    ];
    mockState.fromQueues["schools"] = [
      { data: { id: "sc-1", name: "School", school_code: "SCH", email: "s@s.com", pesapal_ipn_id: null }, error: null },
    ];
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("creates a batch and a line item, returns the funding URL", async () => {
    mockState.current = makeProfile();
    mockState.fromQueues["payroll_records"] = [
      {
        data: [
          {
            id: "r-1",
            staff_id: "s-1",
            net_salary: 500000,
            basic_salary: 500000,
            allowances: 0,
            deductions: 0,
          },
        ],
        error: null,
      },
    ];
    mockState.fromQueues["schools"] = [
      {
        data: {
          id: "sc-1",
          name: "St Mary",
          school_code: "STM",
          email: "s@stm.com",
          pesapal_ipn_id: "ipn-1",
        },
        error: null,
      },
    ];
    mockState.fromQueues["staff_payment_profiles"] = [
      {
        data: {
          preferred_method: "MOBILE_MONEY",
          mobile_number: "0700000001",
          bank_code: null,
          account_number: null,
        },
        error: null,
      },
    ];
    mockState.fromQueues["staff"] = [
      {
        data: { full_name: "Asiimwe", bank_account: null, bank_name: null },
        error: null,
      },
    ];
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.funding_url).toBe("https://pay.pesapal.com/checkout/abc");
    expect(body.data.worker_count).toBe(1);
    // payroll_batches + batch_line_items + audit_logs = 3 inserts
    expect(mockState.insertCalls.map((i) => i.table).sort()).toEqual([
      "audit_logs",
      "batch_line_items",
      "payroll_batches",
    ]);
    // The batch must be in AWAITING_EXTERNAL_FUNDING — not yet paid.
    const batchInsert = mockState.insertCalls.find(
      (i) => i.table === "payroll_batches"
    );
    expect(
      (batchInsert?.data as { funding_payment_status: string })?.funding_payment_status
    ).toBe("AWAITING_EXTERNAL_FUNDING");
    // The line item must snapshot the payment method, not look it up live.
    // .insert() was called with an array of line items, so unwrap.
    const lineInsertCall = mockState.insertCalls.find(
      (i) => i.table === "batch_line_items"
    );
    const lineItems = lineInsertCall?.data as Array<{
      snapshot_payout_method: string;
      snapshot_mobile_number: string;
    }>;
    expect(lineItems).toBeDefined();
    expect(lineItems[0]?.snapshot_payout_method).toBe("MOBILE_MONEY");
    expect(lineItems[0]?.snapshot_mobile_number).toBe("0700000001");
  });

  it("refuses a MOBILE_MONEY payout for a worker with an invalid phone", async () => {
    mockState.current = makeProfile();
    mockState.fromQueues["payroll_records"] = [
      {
        data: [
          {
            id: "r-1",
            staff_id: "s-1",
            net_salary: 500000,
            basic_salary: 500000,
            allowances: 0,
            deductions: 0,
          },
        ],
        error: null,
      },
    ];
    mockState.fromQueues["schools"] = [
      {
        data: { id: "sc-1", name: "X", school_code: "X", email: "x@x.com", pesapal_ipn_id: "ipn-1" },
        error: null,
      },
    ];
    mockState.fromQueues["staff_payment_profiles"] = [
      {
        data: {
          preferred_method: "MOBILE_MONEY",
          mobile_number: "not-a-phone-number",
          bank_code: null,
          account_number: null,
        },
        error: null,
      },
    ];
    mockState.fromQueues["staff"] = [
      {
        data: { full_name: "Bad", bank_account: null, bank_name: null },
        error: null,
      },
    ];
    const { POST } = await import("@/app/api/v1/payroll/approve/route");
    const req = new Request("http://localhost/api/v1/payroll/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payroll_record_ids: ["11111111-1111-4111-8111-111111111111"],
        funding_mechanism: "MOMO_PUSH",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid mobile number/i);
  });
});
