import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `vi.mock` is hoisted above imports. Anything the mock factory
// touches must also be hoisted, otherwise vitest sees a "Cannot
// access X before initialization" error. `vi.hoisted` is the
// escape hatch for that: the value is created before the module
// graph evaluates.
const sentryFns = vi.hoisted(() => ({
  captureException: vi.fn(() => "fake-event-id"),
  captureMessage: vi.fn(() => "fake-event-id"),
  setTag: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
  withScope: vi.fn((fn) => fn({ setTag: vi.fn() })),
  setExtra: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryFns);

// Now import the helpers under test.
import {
  AuthError,
  requireRole,
  requireSchool,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
  paginatedResponse,
} from "@/lib/api-helpers";

/**
 * Gate tests for the auth + response helpers. Covers audit 2.3, 4.1,
 * 4.2, 4.5, 6.6, 6.7.
 */

function makeCtx(role: string, schoolId: string | null) {
  return {
    supabase: {} as never,
    user: { id: "u1" } as never,
    profile: { id: "u1", school_id: schoolId, role, full_name: "x" },
  };
}

describe("requireSchool", () => {
  it("returns the school id when present", () => {
    expect(requireSchool(makeCtx("SCHOOL_ADMIN", "s1"))).toBe("s1");
  });
  it("throws AuthError(400) when school_id is null (audit 2.3)", () => {
    try {
      requireSchool(makeCtx("PARENT", null));
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(400);
    }
  });
});

describe("requireRole", () => {
  it("passes when role is in the allowed list (audit 4.1)", () => {
    expect(() =>
      requireRole(makeCtx("SCHOOL_ADMIN", "s1"), [
        "SCHOOL_ADMIN",
        "TEACHER",
        "SUPER_ADMIN",
      ]),
    ).not.toThrow();
  });
  it("throws AuthError(403) when role is not allowed (audit 2.3, 4.2)", () => {
    try {
      requireRole(makeCtx("PARENT", "s1"), [
        "SCHOOL_ADMIN",
        "TEACHER",
        "SUPER_ADMIN",
      ]);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(403);
    }
  });
});

describe("response envelopes", () => {
  it("successResponse wraps data in { success: true, data }", async () => {
    const res = successResponse({ foo: 1 });
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { foo: 1 } });
  });
  it("errorResponse wraps message in { success: false, error }", async () => {
    const res = errorResponse("nope", 400);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({ success: false, error: "nope" });
  });
  it("successResponse accepts a custom status", async () => {
    const res = successResponse({ id: "x" }, 201);
    expect(res.status).toBe(201);
  });
});

describe("dbError (audit 4.5, 6.7, 6.8)", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fn of Object.values(sentryFns)) fn.mockReset?.();
    sentryFns.captureException.mockReturnValue("fake-event-id");
    sentryFns.captureMessage.mockReturnValue("fake-event-id");
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("does NOT leak the raw error message to the client", async () => {
    const res = dbError(
      { code: "22P02", message: 'invalid input syntax for type uuid: "abc"' },
      "Failed to load records",
    );
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "Failed to load records" });
    expect(JSON.stringify(json)).not.toContain("invalid input syntax");
    expect(JSON.stringify(json)).not.toContain("22P02");
  });

  it("logs the full error server-side for debugging", () => {
    dbError(
      { code: "22P02", message: 'invalid input syntax for type uuid: "abc"' },
      "Failed to load records",
    );
    expect(errSpy).toHaveBeenCalledOnce();
    const logMsg = String(errSpy.mock.calls[0][0]);
    expect(logMsg).toContain("22P02");
    expect(logMsg).toContain("invalid input syntax");
  });

  it("accepts a custom status code", async () => {
    const res = dbError(
      { code: "22023", message: "constraint" },
      "Conflict",
      409,
    );
    expect(res.status).toBe(409);
  });

  it("captures the error to Sentry with the PostgREST code as a tag", () => {
    // The capture wrapper is a no-op when SENTRY_DSN is unset, which
    // is the case in this test env. The important thing is that the
    // call does not throw and that the function does not regress
    // to a raw `any` signature. The Sentry SDK is mocked at the top
    // of this file via `vi.mock("@sentry/nextjs", ...)` so we can
    // assert on its calls.
    dbError(
      { code: "23505", message: "duplicate key" },
      "Conflict",
      409,
      { route: "/api/test", school_id: "s1", user_id: "u1" },
    );
    expect(sentryFns.captureException).toHaveBeenCalledOnce();
    expect(sentryFns.setTag).toHaveBeenCalledWith("db_code", "23505");
    expect(sentryFns.setTag).toHaveBeenCalledWith("school_id", "s1");
    expect(sentryFns.setTag).toHaveBeenCalledWith("route", "/api/test");
  });

  it("accepts a plain Error (not just an object) without throwing", () => {
    const res = dbError(new Error("boom"), "Server error");
    expect(res.status).toBe(500);
  });
});

describe("getErrorStatus (audit 6.6)", () => {
  it("returns 404 for PGRST116 (no rows)", () => {
    // PGRST116 is what `.single()` and miss-prone RPCs throw when no
    // row is returned. Returning 500 made "missing profile" look like
    // "server crash" — the client couldn't distinguish. Audit 6.6
    // (fixed in Phase 2): 404 is the correct semantic.
    expect(getErrorStatus({ code: "PGRST116", message: "no rows" })).toBe(404);
  });

  it("returns 409 for unique-violation codes", () => {
    expect(getErrorStatus({ code: "PGRST301", message: "dup" })).toBe(409);
    expect(getErrorStatus({ code: "23505", message: "dup" })).toBe(409);
  });

  it("returns 400 for foreign-key / check violations", () => {
    expect(getErrorStatus({ code: "23503", message: "fk" })).toBe(400);
    expect(getErrorStatus({ code: "23514", message: "check" })).toBe(400);
  });

  it("returns the AuthError status when the error is one", () => {
    expect(getErrorStatus(new AuthError("Forbidden", 403))).toBe(403);
  });
  it("returns 500 for plain Errors", () => {
    expect(getErrorStatus(new Error("boom"))).toBe(500);
  });
  it("returns 500 for non-Error values", () => {
    expect(getErrorStatus("string error")).toBe(500);
    expect(getErrorStatus(undefined)).toBe(500);
  });
});

describe("paginatedResponse (audit 2.1, 4.6, 4.7)", () => {
  it("wraps items in the standard envelope and computes totalPages", async () => {
    const res = paginatedResponse([{ id: 1 }, { id: 2 }], 25, 1, 10);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: {
        items: [{ id: 1 }, { id: 2 }],
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      },
    });
  });

  it("handles empty list and zero total cleanly", async () => {
    const res = paginatedResponse([], 0, 1, 20);
    const json = await res.json();
    expect(json.data.items).toEqual([]);
    expect(json.data.total).toBe(0);
    expect(json.data.totalPages).toBe(0);
  });

  it("coerces null/undefined items to []", async () => {
    const res = paginatedResponse(null as never, 0, 1, 20);
    const json = await res.json();
    expect(json.data.items).toEqual([]);
  });
});
