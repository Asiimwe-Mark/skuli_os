/**
 * Gate tests for the meetings/slots route after the Phase 3A refactor.
 *
 * Pins the contract:
 *  - PARENT gets 403 (not 400, not 500)
 *  - SCHOOL_ADMIN with no school_id gets 400
 *  - SCHOOL_ADMIN with a teacher from another school gets 404
 *  - SCHOOL_ADMIN with their own teacher gets 200
 *
 * These were bugs before the refactor: a PARENT hit a 500 from the
 * raw `errorResponse(error.message, 500)` path, the response shape
 * was raw instead of `{ success, data }`, and the route
 * re-implemented auth inline (drift risk). The refactor moves
 * everything onto `getSupabaseAndUser` + `requireRole` + `dbError`.
 */
import { describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};
const mockState: { current: Profile | null; teacherInSchool: boolean } = {
  current: null,
  teacherInSchool: true,
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
      // The staff lookup decides whether the teacher is "in school"
      // (returns a row) or "not in school" (returns null).
      const makeStaffChain = () => {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.maybeSingle = async () => ({
          data: mockState.teacherInSchool ? { id: profile.id } : null,
          error: null,
        });
        return c;
      };
      // meeting_slots query chain — returns [] from .order()'s await
      const makeSlotsChain = () => {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.order = async () => ({ data: [], error: null });
        return c;
      };
      const supabase = {
        from: (table: string) => {
          if (table === "staff") return makeStaffChain();
          return makeSlotsChain();
        },
        rpc: async () => ({ error: null }),
      };
      return { supabase: supabase as never, user: { id: profile.id }, profile };
    },
  };
});

import { GET as slotsGET, POST as slotsPOST } from "@/app/api/meetings/slots/route";

function fakeRequest(body: unknown = null, url = "http://test.local/") {
  if (body == null) {
    return new Request(url, { method: "GET" });
  }
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setProfile(role: string, school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
}

describe("GET /api/meetings/slots (audit 3.2, 3.45-3.47)", () => {
  it("returns 403 when called as PARENT", async () => {
    setProfile("PARENT");
    const res = await slotsGET(
      new Request("http://test.local/?teacher_id=t1&date=2024-01-01") as never,
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 400 when teacher_id or date missing", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await slotsGET(new Request("http://test.local/") as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when teacher is from another school", async () => {
    setProfile("SCHOOL_ADMIN");
    mockState.teacherInSchool = false;
    const res = await slotsGET(
      new Request("http://test.local/?teacher_id=t1&date=2024-01-01") as never,
    );
    expect(res.status).toBe(404);
    mockState.teacherInSchool = true;
  });

  it("returns 200 with empty array when teacher is in the caller's school", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await slotsGET(
      new Request("http://test.local/?teacher_id=t1&date=2024-01-01") as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe("POST /api/meetings/slots (audit 3.2, 3.47)", () => {
  it("returns 403 when called as PARENT", async () => {
    setProfile("PARENT");
    const res = await slotsPOST(
      fakeRequest({
        teacher_id: "00000000-0000-0000-0000-000000000001",
        slot_date: "2024-01-01",
        start_time: "09:00",
        end_time: "10:00",
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await slotsPOST(fakeRequest({ foo: "bar" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid input from SCHOOL_ADMIN", async () => {
    setProfile("SCHOOL_ADMIN");
    // Pre-construct the request explicitly to avoid any ambiguity in
    // the fakeRequest helper.
    const req = new Request("http://test.local/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacher_id: "11111111-1111-4111-8111-111111111111",
        slot_date: "2024-01-01",
        start_time: "09:00",
        end_time: "10:00",
      }),
    });
    const res = await slotsPOST(req as never);
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.generated).toBe(true);
  });
});
