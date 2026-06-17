/**
 * Gate tests for /api/library/issues POST + PATCH (audit 4.12, 7.27).
 *
 * The previous flow was three round-trips (availability check + INSERT +
 * decrement RPC) with a TOCTOU race window. The route now calls the
 * issue_library_book / return_library_book RPCs (migration 00062) which
 * wrap the check + UPDATE + INSERT in a single transaction under
 * SELECT ... FOR UPDATE. These tests pin the error-code translation
 * contract so the UI keeps seeing the same 400/404 messages.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

type RpcResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

const mockState: {
  current: Profile | null;
  queue: RpcResponse[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  preReadRow: unknown | null;
} = {
  current: null,
  queue: [],
  rpcCalls: [],
  preReadRow: null,
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
      const rpc = (fn: string, args: Record<string, unknown>) => {
        mockState.rpcCalls.push({ fn, args });
        const next = mockState.queue.shift();
        if (!next) {
          return Promise.resolve({ data: null, error: { message: "no mock queued" } });
        }
        return Promise.resolve(next);
      };
      const from = (_table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: mockState.preReadRow, error: null }),
              }),
            }),
          }),
        }),
      });
      return { supabase: { rpc, from } as never, user: { id: profile.id }, profile };
    },
  };
});

import { POST, PATCH } from "@/app/api/library/issues/route";

function fakePost(body: unknown) {
  return new Request("http://test.local/api/library/issues", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function fakePatch(body: unknown) {
  return new Request("http://test.local/api/library/issues", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.queue = [];
  mockState.rpcCalls = [];
  mockState.preReadRow = null;
}

beforeEach(() => setProfile());

const BOOK_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const STUDENT_UUID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const ISSUE_UUID = "c3d4e5f6-a7b8-4c9d-9e1f-2a3b4c5d6e7f";
const VALID_ISSUE = { book_id: BOOK_UUID, student_id: STUDENT_UUID, due_date: "2026-07-01" };
const VALID_RETURN = { issue_id: ISSUE_UUID, fine_paid: false };

describe("POST /api/library/issues — atomic issue_library_book RPC (audit 4.12, 7.27)", () => {
  it("returns 403 for PARENT", async () => {
    setProfile("PARENT");
    const res = await POST(fakePost(VALID_ISSUE) as never);
    expect(res.status).toBe(403);
  });

  it("translates Zod failures to 400", async () => {
    const res = await POST(fakePost({ book_id: "not-a-uuid" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 200 with the new issue row on success", async () => {
    mockState.queue.push({
      data: { id: ISSUE_UUID, book_id: BOOK_UUID, student_id: STUDENT_UUID },
      error: null,
    });
    const res = await POST(fakePost(VALID_ISSUE) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(ISSUE_UUID);
  });

  it("calls the issue_library_book RPC with the expected args", async () => {
    mockState.queue.push({ data: { id: ISSUE_UUID }, error: null });
    await POST(fakePost(VALID_ISSUE) as never);
    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0].fn).toBe("issue_library_book");
    expect(mockState.rpcCalls[0].args).toEqual({
      p_school_id: "s1",
      p_book_id: BOOK_UUID,
      p_student_id: STUDENT_UUID,
      p_due_date: "2026-07-01",
      p_issued_by: "u1",
    });
  });

  it("translates P0001 (no copies) to 400 'No copies available'", async () => {
    mockState.queue.push({ data: null, error: { code: "P0001", message: "No copies available" } });
    const res = await POST(fakePost(VALID_ISSUE) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error ?? json.message).toBe("No copies available");
  });

  it("translates P0002 (not found) to 404 'Book or student not found in this school'", async () => {
    mockState.queue.push({ data: null, error: { code: "P0002", message: "Book not found" } });
    const res = await POST(fakePost(VALID_ISSUE) as never);
    expect(res.status).toBe(404);
  });

  it("returns 500 on unexpected RPC errors", async () => {
    mockState.queue.push({ data: null, error: { code: "42P01", message: "undefined_table" } });
    const res = await POST(fakePost(VALID_ISSUE) as never);
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/library/issues — atomic return_library_book RPC (audit 4.12, 7.27)", () => {
  it("returns 403 for PARENT", async () => {
    setProfile("PARENT");
    const res = await PATCH(fakePatch(VALID_RETURN) as never);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the pre-read finds no outstanding issue", async () => {
    mockState.preReadRow = null;
    const res = await PATCH(fakePatch(VALID_RETURN) as never);
    expect(res.status).toBe(404);
  });

  it("auto-computes fine when overdue and client did not provide one", async () => {
    const yesterday = new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0];
    mockState.preReadRow = { due_date: yesterday, returned_at: null };
    mockState.queue.push({
      data: { id: ISSUE_UUID, fine_amount: 5 * 500, fine_paid: false },
      error: null,
    });
    const res = await PATCH(fakePatch(VALID_RETURN) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.fine_amount).toBe(2500);
  });

  it("skips the pre-read when client provides fine_amount", async () => {
    mockState.queue.push({
      data: { id: ISSUE_UUID, fine_amount: 1000, fine_paid: true },
      error: null,
    });
    // preReadRow is null; if the route did call the pre-read we'd hit
    // the 404 branch. Asserting 200 proves it skipped.
    const res = await PATCH(
      fakePatch({ issue_id: ISSUE_UUID, fine_amount: 1000, fine_paid: true }) as never,
    );
    expect(res.status).toBe(200);
  });

  it("translates P0002 from the return RPC to 404 'Issue not found or already returned'", async () => {
    mockState.preReadRow = { due_date: "2099-01-01", returned_at: null };
    mockState.queue.push({ data: null, error: { code: "P0002", message: "already returned" } });
    const res = await PATCH(fakePatch(VALID_RETURN) as never);
    expect(res.status).toBe(404);
  });
});
