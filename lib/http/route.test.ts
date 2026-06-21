/**
 * Gate tests for the `route()` / `publicRoute()` / `respond` contract.
 *
 * Covers audit / migration guide §4.1 + §7:
 *
 *   (a) handler with schema gets typed body
 *   (b) handler without schema gets (ctx, req)
 *   (c) 401 when no user
 *   (d) 403 when role mismatch
 *   (e) 400 on schema failure
 *   (f) generic 500 on thrown error (no leakage)
 *   (g) respond.status(201, x) produces 201
 *   (h) respond.cacheable(x) produces the cacheable Cache-Control header
 *
 * Implementation note
 * -------------------
 * `getSupabaseAndUser` and `handleRouteError` are mocked. `handleRouteError`
 * is what the production wrapper calls on every thrown error, so mocking
 * it gives us a deterministic error path without standing up Sentry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { NextRequest as NextRequestType } from "next/server";
import { z } from "zod";

// Mocked auth + error helpers. `vi.mock` is hoisted above imports so
// the factories must use `vi.hoisted` to reference shared mutable state.
const authMock = vi.hoisted(() => ({
  getSupabaseAndUser: vi.fn(),
}));
const sentryFns = vi.hoisted(() => ({
  captureException: vi.fn((..._args: unknown[]) => "fake-event-id"),
  captureMessage: vi.fn((..._args: unknown[]) => "fake-event-id"),
  setTag: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
  withScope: vi.fn((fn: (scope: { setTag: ReturnType<typeof vi.fn> }) => unknown) => {
    fn({ setTag: vi.fn() });
  }),
  setExtra: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryFns);

vi.mock("@/lib/api-helpers", async () => {
  // Return the real module's bindings + the two overrides we need.
  // We can't import the real module synchronously here (vi.mock is
  // hoisted), so re-import it inside the async factory.
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>(
    "@/lib/api-helpers",
  );
  return {
    ...actual,
    getSupabaseAndUser: authMock.getSupabaseAndUser,
    // Override handleRouteError with a deterministic version. The
    // production one routes to Sentry; we just want a known shape.
    handleRouteError: (err: unknown, _route: string) => {
      sentryFns.captureException(err);
      const status =
        err && typeof err === "object" && "status" in err
          ? ((err as { status?: number }).status ?? 500)
          : 500;
      return Response.json(
        { success: false, error: "Internal server error" },
        { status },
      );
    },
  };
});

// Import AFTER mocks are wired so the module graph sees them.
import { route, publicRoute } from "@/lib/http/route";
import { respond } from "@/lib/http/respond";
import { CACHEABLE_CACHE_CONTROL } from "@/lib/http";

function makeRequest(body?: unknown): NextRequestType {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  // Build a NextRequest from a real URL so `req.nextUrl.pathname`
  // is populated. The wrapper reads it on every error path, so a
  // bare `new Request(...)` cast is not enough.
  const nextReq = new NextRequest(
    new Request("http://localhost/api/test", init),
  );
  return nextReq;
}

function makeCtx(role: string, schoolId: string | null) {
  return {
    supabase: {} as never,
    user: { id: "u1" } as never,
    profile: { id: "u1", school_id: schoolId, role, full_name: "x" },
  };
}

describe("route() — handler shape", () => {
  beforeEach(() => {
    authMock.getSupabaseAndUser.mockReset();
    for (const fn of Object.values(sentryFns)) fn.mockReset?.();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) handler with schema gets the parsed + typed body", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("SCHOOL_ADMIN", "s1"),
    );
    const bodySchema = z.object({ name: z.string(), age: z.number() });

    const POST = route({
      roles: ["SCHOOL_ADMIN"],
      schema: bodySchema,
      handler: async (_ctx, body) => {
        // Compile-time assertion: `body` is `{ name: string; age: number }`.
        return { greeting: `hi ${body.name} (${body.age})` };
      },
    });

    const res = await POST(makeRequest({ name: "A", age: 3 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: { greeting: "hi A (3)" },
    });
  });

  it("(b) handler without schema gets (ctx, request)", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("SCHOOL_ADMIN", "s1"),
    );

    const GET = route({
      roles: ["SCHOOL_ADMIN"],
      handler: async (_ctx, request) => {
        // Compile-time assertion: second arg is NextRequest.
        const url = new URL(request.url);
        return { path: url.pathname };
      },
    });

    const req = new NextRequest(
      new Request("http://localhost/api/test?x=1"),
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { path: "/api/test" } });
  });
});

describe("route() — auth & validation errors", () => {
  beforeEach(() => {
    authMock.getSupabaseAndUser.mockReset();
    for (const fn of Object.values(sentryFns)) fn.mockReset?.();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(c) 401 when no user — getSupabaseAndUser throws AuthError(401)", async () => {
    const { AuthError } = await import("@/lib/api-helpers");
    authMock.getSupabaseAndUser.mockRejectedValue(new AuthError("Unauthorized", 401));

    const GET = route({
      roles: ["SCHOOL_ADMIN"],
      handler: async () => ({ ok: true }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "Unauthorized" });
  });

  it("(d) 403 when role mismatch", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("PARENT", "s1"),
    );

    const GET = route({
      roles: ["SCHOOL_ADMIN"],
      handler: async () => ({ ok: true }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("(d2) 400 when school_id missing for non-SUPER_ADMIN (noSchoolRequired unset)", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("PARENT", null),
    );

    const GET = route({
      roles: ["PARENT"],
      handler: async () => ({ ok: true }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("(d3) schoolless SUPER_ADMIN passes the school guard", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("SUPER_ADMIN", null),
    );

    const GET = route({
      roles: ["SUPER_ADMIN"],
      handler: async () => ({ ok: true }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("(e) 400 on schema validation failure with the first issue message", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("SCHOOL_ADMIN", "s1"),
    );

    const bodySchema = z.object({
      name: z.string().min(1),
      age: z.number().int().min(0),
    });

    const POST = route({
      roles: ["SCHOOL_ADMIN"],
      schema: bodySchema,
      handler: async () => ({ ok: true }),
    });

    const res = await POST(makeRequest({ name: "", age: -1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
  });
});

describe("route() — error envelope safety", () => {
  beforeEach(() => {
    authMock.getSupabaseAndUser.mockReset();
    for (const fn of Object.values(sentryFns)) fn.mockReset?.();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(f) generic 500 on thrown error — raw message is NOT leaked", async () => {
    authMock.getSupabaseAndUser.mockResolvedValue(
      makeCtx("SCHOOL_ADMIN", "s1"),
    );

    const GET = route({
      roles: ["SCHOOL_ADMIN"],
      handler: async () => {
        throw new Error(
          "duplicate key value violates unique constraint fee_payments_mm_tx_id_unique",
        );
      },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "Internal server error" });
    // Audit P1: never leak the raw DB message to the client.
    expect(JSON.stringify(json)).not.toContain("fee_payments_mm_tx_id_unique");
    expect(JSON.stringify(json)).not.toContain("duplicate key");
  });
});

describe("respond helpers", () => {
  it("(g) respond.status(201, x) produces 201 with the envelope", async () => {
    const res = respond.status(201, { id: "abc" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { id: "abc" } });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("(h) respond.cacheable(x) produces the cacheable Cache-Control header", async () => {
    const res = respond.cacheable({ items: [1, 2, 3] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { items: [1, 2, 3] } });
    expect(res.headers.get("Cache-Control")).toBe(CACHEABLE_CACHE_CONTROL);
  });
});

describe("publicRoute()", () => {
  beforeEach(() => {
    for (const fn of Object.values(sentryFns)) fn.mockReset?.();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the request through to the handler and returns its response unchanged", async () => {
    const POST = publicRoute(async (request) => {
      const body = await request.json();
      return Response.json({ status: "ok", echoed: body });
    });

    const res = await POST(makeRequest({ ping: "pong" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "ok", echoed: { ping: "pong" } });
  });

  it("routes unhandled throws through handleRouteError with a clean 500", async () => {
    const POST = publicRoute(async () => {
      throw new Error("secret internal stack trace");
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("secret internal stack trace");
  });
});
