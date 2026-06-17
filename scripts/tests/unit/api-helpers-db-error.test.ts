/**
 * Gate tests for lib/api-helpers dbError (audit 6.6).
 *
 * The previous dbError always returned 500, so a `.single()` that
 * missed (PGRST116) surfaced as a generic 500 to the client instead
 * of a 404. Now the helper maps known PostgREST / Postgres error
 * codes to real HTTP statuses; an explicit status arg still wins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dbError, errorResponse } from "@/lib/api-helpers";

describe("dbError status mapping (audit 6.6)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  async function call(errorObj: unknown, msg?: string, explicitStatus?: { route?: string; school_id?: string | null; user_id?: string | null; status?: number }) {
    const res = dbError(errorObj, msg, explicitStatus);
    const json = await res.json();
    return { status: res.status, json };
  }

  it("PGRST116 (no rows) maps to 404", async () => {
    const { status, json } = await call({ code: "PGRST116", message: "no rows" });
    expect(status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe("A database error occurred");
  });

  it("23505 (unique violation) maps to 409", async () => {
    const { status } = await call({ code: "23505", message: "duplicate key" });
    expect(status).toBe(409);
  });

  it("PGRST301 (PostgREST unique) maps to 409", async () => {
    const { status } = await call({ code: "PGRST301", message: "duplicate" });
    expect(status).toBe(409);
  });

  it("23503 (FK violation) maps to 400", async () => {
    const { status } = await call({ code: "23503", message: "fk" });
    expect(status).toBe(400);
  });

  it("23514 (check violation) maps to 400", async () => {
    const { status } = await call({ code: "23514", message: "check" });
    expect(status).toBe(400);
  });

  it("22P02 (invalid text) maps to 400", async () => {
    const { status } = await call({ code: "22P02", message: "bad uuid" });
    expect(status).toBe(400);
  });

  it("42501 (insufficient privilege) maps to 403", async () => {
    const { status } = await call({ code: "42501", message: "denied" });
    expect(status).toBe(403);
  });

  it("unknown code falls through to 500", async () => {
    const { status } = await call({ code: "XX9999", message: "weird" });
    expect(status).toBe(500);
  });

  it("explicit status arg wins over the code mapping", async () => {
    // Caller asked for 503, the error code would map to 404. The
    // explicit arg is the caller's intent and should win.
    const { status } = await call({ code: "PGRST116" }, "Service is down", { route: "/api/test", school_id: "s1", user_id: "u1", status: 503 });
    expect(status).toBe(503);
  });

  it("uses the supplied clientMessage verbatim", async () => {
    const { json } = await call({ code: "PGRST116" }, "No record found");
    expect(json.error).toBe("No record found");
  });

  it("logs the full error server-side (including code and message)", async () => {
    await call({ code: "PGRST116", message: "no rows for student 42" });
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const logged = String(consoleErrorSpy.mock.calls[0][0]);
    expect(logged).toContain("PGRST116");
    expect(logged).toContain("no rows for student 42");
  });

  it("handles a non-object error gracefully", async () => {
    const { status, json } = await call("string error");
    expect(status).toBe(500);
    expect(json.error).toBe("A database error occurred");
  });
});

describe("errorResponse (sanity)", () => {
  it("returns a 500 by default", async () => {
    const res = errorResponse("boom");
    expect(res.status).toBe(500);
  });

  it("respects an explicit status", async () => {
    const res = errorResponse("nope", 403);
    expect(res.status).toBe(403);
  });
});
