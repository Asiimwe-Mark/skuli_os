/**
 * Regression tests for the Pesapal IPN webhook handler.
 *
 * SECURITY: the handler must NEVER trust the IPN's query params. It
 * always calls getTransactionStatus() server-to-server first; only on
 * a verified COMPLETED status does it flip a record to a terminal
 * state. The IPN params only tell the handler WHICH records to
 * lookup; the actual money state comes from the gateway.
 *
 * The handler routes three record types by merchant reference:
 *   1. tuition_payments        (PENDING → COMPLETED|FAILED)
 *   2. payroll_batches         (AWAITING_EXTERNAL_FUNDING → SUCCESS|FAILED)
 *   3. subscription_invoices   (pending → paid)
 *
 * If the verified status reports COMPLETED but the matching record
 * is already in a terminal state, the handler must be a no-op — the
 * gateway can deliver IPNs more than once.
 *
 * If the merchant reference matches no record at all, the handler
 * must still return 200 with processed: "no_match" so Pesapal does
 * not retry forever.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verificationResult: {
  paymentStatus: "COMPLETED" | "FAILED" | "PENDING" | "INVALID" | null;
  amount: number;
  error: string | null;
} = {
  paymentStatus: "COMPLETED",
  amount: 100_000,
  error: null,
};

const adminRpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const adminUpdateCalls: Array<{ table: string; data: unknown }> = [];
const adminInsertCalls: Array<{ table: string; data: unknown }> = [];
const adminSelectQueues: Record<
  string,
  Array<{ data: unknown; error: { message: string } | null }>
> = {};

vi.mock("@/lib/gateways/pesapal", () => ({
  getTransactionStatus: async () => verificationResult,
  submitOrderRequest: async () => ({
    orderTrackingId: "ot-1",
    redirectUrl: "https://pay.pesapal.com/x",
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: () => {
      const from = (table: string) => {
        const queue = adminSelectQueues[table] ?? [];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.single = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.update = (data: unknown) => {
          adminUpdateCalls.push({ table, data });
          return chain;
        };
        chain.insert = (data: unknown) => {
          adminInsertCalls.push({ table, data });
          return Promise.resolve({ data: null, error: null });
        };
        return chain;
      };
      return {
        from,
        rpc: async (fn: string, args: Record<string, unknown>) => {
          adminRpcCalls.push({ fn, args });
          return { data: null, error: null };
        },
      };
    },
  };
});

const dispatchNotificationsMock = vi.fn((_arg: unknown) => Promise.resolve(undefined));
const queueDisbursementBatchMock = vi.fn((_arg: unknown) => Promise.resolve(undefined));

vi.mock("@/lib/services/notifications", () => ({
  dispatchNotifications: (arg: unknown) => dispatchNotificationsMock(arg),
}));
vi.mock("@/lib/services/payroll-disbursement", () => ({
  queueDisbursementBatch: (arg: unknown) => queueDisbursementBatchMock(arg),
}));

beforeEach(() => {
  verificationResult.paymentStatus = "COMPLETED";
  verificationResult.amount = 100_000;
  verificationResult.error = null;
  adminRpcCalls.length = 0;
  adminUpdateCalls.length = 0;
  adminInsertCalls.length = 0;
  for (const k of Object.keys(adminSelectQueues)) delete adminSelectQueues[k];
  dispatchNotificationsMock.mockClear();
  queueDisbursementBatchMock.mockClear();
});

describe("Pesapal IPN webhook", () => {
  it("ignores requests with missing params and returns 200", async () => {
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request("http://localhost/api/webhooks/pesapal") as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ignored");
  });

  it("returns verification_failed without mutating when getTransactionStatus errors", async () => {
    verificationResult.error = "Pesapal unreachable";
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=tu-1"
      ) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("verification_failed");
    expect(adminRpcCalls).toHaveLength(0);
  });

  it("confirms a PENDING tuition payment on COMPLETED", async () => {
    adminSelectQueues["tuition_payments"] = [
      {
        data: {
          id: "tu-1",
          school_id: "sc-1",
          student_id: "st-1",
          fee_account_id: "fa-1",
          amount: 100_000,
          status: "PENDING",
        },
        error: null,
      },
    ];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=tu-1"
      ) as never
    );
    const body = await res.json();
    expect(body.processed).toBe("tuition_payment");
    expect(adminRpcCalls[0]?.fn).toBe("confirm_tuition_payment");
    expect(adminRpcCalls[0]?.args).toMatchObject({
      p_tuition_payment_id: "tu-1",
      p_new_status: "COMPLETED",
    });
    expect(dispatchNotificationsMock).toHaveBeenCalledOnce();
  });

  it("marks a tuition payment FAILED when verification is FAILED", async () => {
    verificationResult.paymentStatus = "FAILED";
    adminSelectQueues["tuition_payments"] = [
      {
        data: {
          id: "tu-1",
          school_id: "sc-1",
          student_id: "st-1",
          fee_account_id: "fa-1",
          amount: 100_000,
          status: "PENDING",
        },
        error: null,
      },
    ];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=tu-1"
      ) as never
    );
    expect(adminRpcCalls[0]?.args).toMatchObject({
      p_new_status: "FAILED",
    });
    // No notification on failure.
    expect(dispatchNotificationsMock).not.toHaveBeenCalled();
  });

  it("is a no-op on a re-delivered IPN for a terminal tuition payment", async () => {
    adminSelectQueues["tuition_payments"] = [
      {
        data: {
          id: "tu-1",
          school_id: "sc-1",
          student_id: "st-1",
          fee_account_id: "fa-1",
          amount: 100_000,
          status: "COMPLETED",
        },
        error: null,
      },
    ];
    adminSelectQueues["payroll_batches"] = [{ data: null, error: null }];
    adminSelectQueues["subscription_invoices"] = [{ data: null, error: null }];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=tu-1"
      ) as never
    );
    const body = await res.json();
    // A re-delivered IPN for a record that is already in a terminal
    // state must NOT trigger another confirm — the gateway can retry
    // the IPN. The route falls through to no_match instead of mutating.
    expect(body.processed).toBe("no_match");
    expect(adminRpcCalls).toHaveLength(0);
    expect(dispatchNotificationsMock).not.toHaveBeenCalled();
  });

  it("flips a payroll batch and queues disbursement on COMPLETED", async () => {
    adminSelectQueues["tuition_payments"] = [{ data: null, error: null }];
    adminSelectQueues["payroll_batches"] = [
      {
        data: {
          id: "pb-1",
          school_id: "sc-1",
          funding_payment_status: "AWAITING_EXTERNAL_FUNDING",
        },
        error: null,
      },
    ];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=batch-ref"
      ) as never
    );
    const body = await res.json();
    expect(body.processed).toBe("payroll_funding");
    expect(queueDisbursementBatchMock).toHaveBeenCalledWith("pb-1");
  });

  it("marks a payroll batch FAILED without queueing disbursement on FAILED", async () => {
    verificationResult.paymentStatus = "FAILED";
    adminSelectQueues["tuition_payments"] = [{ data: null, error: null }];
    adminSelectQueues["payroll_batches"] = [
      {
        data: {
          id: "pb-1",
          school_id: "sc-1",
          funding_payment_status: "AWAITING_EXTERNAL_FUNDING",
        },
        error: null,
      },
    ];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=batch-ref"
      ) as never
    );
    const body = await res.json();
    expect(body.processed).toBe("payroll_funding");
    expect(queueDisbursementBatchMock).not.toHaveBeenCalled();
  });

  it("activates a subscription on a COMPLETED invoice and writes an audit log", async () => {
    adminSelectQueues["tuition_payments"] = [{ data: null, error: null }];
    adminSelectQueues["payroll_batches"] = [{ data: null, error: null }];
    adminSelectQueues["subscription_invoices"] = [
      {
        data: {
          id: "inv-1",
          school_id: "sc-1",
          plan: "growth",
          status: "pending",
        },
        error: null,
      },
    ];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=inv-ref"
      ) as never
    );
    const body = await res.json();
    expect(body.processed).toBe("subscription");
    const subsUpdate = adminUpdateCalls.find((c) => c.table === "subscription_invoices");
    expect(subsUpdate).toBeDefined();
    const schoolUpdate = adminUpdateCalls.find((c) => c.table === "schools");
    expect(schoolUpdate).toBeDefined();
    const auditInsert = adminInsertCalls.find((c) => c.table === "audit_logs");
    expect(auditInsert?.data).toMatchObject({
      action: "subscription_payment_confirmed_pesapal",
    });
  });

  it("returns processed: 'no_match' when nothing matches the merchant ref", async () => {
    adminSelectQueues["tuition_payments"] = [{ data: null, error: null }];
    adminSelectQueues["payroll_batches"] = [{ data: null, error: null }];
    adminSelectQueues["subscription_invoices"] = [{ data: null, error: null }];
    const { GET } = await import("@/app/api/webhooks/pesapal/route");
    const res = await GET(
      new Request(
        "http://localhost/api/webhooks/pesapal?OrderTrackingId=ot-1&OrderMerchantReference=ghost"
      ) as never
    );
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.processed).toBe("no_match");
  });
});
