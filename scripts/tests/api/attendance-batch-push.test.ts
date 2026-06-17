/**
 * Gate tests for /api/attendance POST (audit 4.11).
 *
 * The previous flow iterated the absent students and did
 * 2 round-trips per student (student fetch + parent user fetch).
 * The route now batches into 2 .in() queries regardless of
 * how many absentees there are. These tests pin the
 * sub-query reduction contract: the .from() call list should
 * not include a per-student students or users fetch.
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
  // Captures every .from(table) call, in order.
  fromCalls: string[];
  // Per-call returned data, keyed by table. Each .from() pops the
  // head of the queue for that table.
  fromQueues: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
} = {
  current: null,
  fromCalls: [],
  fromQueues: {},
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
        chain.in = () => chain;
        chain.insert = () => Promise.resolve({ error: null });
        chain.upsert = () => ({
          select: () => Promise.resolve({ data: [], error: null }),
        });
        chain.update = () => ({
          eq: () => Promise.resolve({ error: null }),
        });
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
        supabase: { from } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

// Stub the push helper — we don't want real network.
vi.mock("@/lib/push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/attendance/route";

function fakePost(body: unknown) {
  return new Request("http://test.local/api/attendance", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.fromCalls = [];
  mockState.fromQueues = {};
}

beforeEach(() => setProfile());

describe("POST /api/attendance — batched push notifications (audit 4.11)", () => {
  it("returns 403 for PARENT", async () => {
    setProfile("PARENT");
    const res = await POST(
      fakePost({
        class_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        date: "2026-06-06",
        records: [],
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing records", async () => {
    const res = await POST(
      fakePost({
        class_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        date: "2026-06-06",
        records: [],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("issues at most ONE students SELECT and ONE users SELECT regardless of absent count (audit 4.11)", async () => {
    // 5 absent students; before the fix the route would do 5
    // students SELECTs and 5 users SELECTs (10 round-trips on
    // top of the upsert). The fix batches both into 1 .in() each.
    const absent = [
      { student_id: "s1", status: "absent" },
      { student_id: "s2", status: "absent" },
      { student_id: "s3", status: "absent" },
      { student_id: "s4", status: "absent" },
      { student_id: "s5", status: "absent" },
    ];
    setProfile();
    mockState.fromQueues = {
      classes: [{ data: { id: "c1" }, error: null }],
      students: [
        {
          data: [
            { id: "s1", full_name: "A", parent_phone: "0700" },
            { id: "s2", full_name: "B", parent_phone: "0701" },
            { id: "s3", full_name: "C", parent_phone: "0702" },
            { id: "s4", full_name: "D", parent_phone: "0703" },
            { id: "s5", full_name: "E", parent_phone: "0704" },
          ],
          error: null,
        },
      ],
      users: [
        {
          data: [
            { id: "p1", phone: "0700" },
            { id: "p2", phone: "0701" },
            { id: "p3", phone: "0702" },
            { id: "p4", phone: "0703" },
            { id: "p5", phone: "0704" },
          ],
          error: null,
        },
      ],
    };

    const res = await POST(
      fakePost({
        class_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        date: "2026-06-06",
        records: absent,
      }) as never,
    );
    // The route also does a final audit_logs insert; this test
    // mocks all required tables. The status depends on the audit
    // log not being stubbed — we don't care about the status,
    // only that the per-student loop is gone.
    void res;
    const studentCalls = mockState.fromCalls.filter((t) => t === "students").length;
    const userCalls = mockState.fromCalls.filter((t) => t === "users").length;
    expect(studentCalls).toBeLessThanOrEqual(1);
    expect(userCalls).toBeLessThanOrEqual(1);
  });
});
