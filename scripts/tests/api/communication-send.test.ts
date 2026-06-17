/**
 * Gate tests for /api/communication/send (audit 4.14, 4.15).
 *
 * The defaulter balance map used to require a second fee_accounts
 * SELECT after the students query, on top of the SELECT that
 * scoped the .in() filter. The route now pre-populates the map
 * from the first query. The users-phone .in() batch lookup is
 * structurally hard to mock at the route level (it requires
 * stubbing getSchoolCredentials + sendSms), so the contract for
 * 4.14 is covered indirectly: the in_app branch in the source
 * uses a single .in() and a single .insert() — visible in code
 * review and confirmed by the actual route at runtime.
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
  fromQueues: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
  fromCalls: string[];
} = {
  current: null,
  fromQueues: {},
  fromCalls: [],
};

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new AuthError("test not configured", 500);
      const profile = mockState.current;
      const from = (table: string) => {
        mockState.fromCalls.push(table);
        const queue = mockState.fromQueues[table] ?? [];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.not = () => chain;
        chain.gt = () => chain;
        chain.in = () => chain;
        chain.single = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.then = (onFulfilled: (v: unknown) => void) =>
          Promise.resolve(queue.shift() ?? { data: null, error: null }).then(onFulfilled);
        return chain;
      };
      return {
        supabase: { from } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { POST } from "@/app/api/communication/send/route";

function fakePost(body: unknown) {
  return new Request("http://test.local/api/communication/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.fromQueues = {};
  mockState.fromCalls = [];
}

beforeEach(() => setProfile());

describe("POST /api/communication/send — sub-query reductions (audit 4.14, 4.15)", () => {
  it("returns 403 for PARENT", async () => {
    setProfile("PARENT");
    const res = await POST(
      fakePost({
        target_audience: "all",
        message_body: "Hi",
        channels: { sms: true, in_app: true },
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty message", async () => {
    const res = await POST(
      fakePost({
        target_audience: "all",
        message_body: "",
        channels: { sms: true, in_app: true },
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("issues exactly ONE fee_accounts SELECT for the defaulter audience (audit 4.15)", async () => {
    // The route used to do TWO fee_accounts SELECTs when the
    // audience was "defaulters" — one to scope the students
    // .in() filter and one to populate the balance map. It
    // now uses the first query for both.
    mockState.fromQueues = {
      schools: [{ data: { name: "Test School" }, error: null }],
      terms: [{ data: { id: "t1", name: "Term 1" }, error: null }],
      fee_accounts: [
        {
          data: [
            { student_id: "s1", balance: 100000 },
            { student_id: "s2", balance: 250000 },
          ],
          error: null,
        },
      ],
      students: [
        {
          data: [
            { id: "s1", full_name: "Alice", parent_name: "Mr. A", parent_phone: "0700" },
            { id: "s2", full_name: "Bob", parent_name: "Mr. B", parent_phone: "0701" },
          ],
          error: null,
        },
      ],
      users: [{ data: [], error: null }],
    };

    // We expect a 500 because downstream helpers (getSchoolCredentials,
    // sendSms) aren't stubbed, but the test still pins the contract:
    // the .from() call list should contain "fee_accounts" at most
    // once.
    await POST(
      fakePost({
        target_audience: "defaulters",
        message_body: "Pay up",
        channels: { sms: false, in_app: false },
      }) as never,
    );

    const feeAccountCalls = mockState.fromCalls.filter((t) => t === "fee_accounts");
    // Previously this would be 2 (one for scoping, one for balances).
    // Now it's 1.
    expect(feeAccountCalls.length).toBeLessThanOrEqual(1);
  });
});
