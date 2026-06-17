import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the typed Sentry wrapper. The wrapper is a no-op when
 * SENTRY_DSN is not set, but it must still:
 *   - not throw on any input shape,
 *   - wrap non-Error values in Error so stacks are useful,
 *   - accept the full CaptureContext without TS complaints.
 *
 * We mock @sentry/nextjs with `vi.mock` (hoisted) rather than
 * `vi.spyOn` because vitest cannot redefine exports of an ESM
 * module at runtime. The mock factory references `sentryFns`,
 * which must be created via `vi.hoisted` to be available when
 * the factory is evaluated.
 */

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

import {
  captureException,
  captureMessage,
  addBreadcrumb,
  captureErrors,
} from "@/lib/error-report";

beforeEach(() => {
  for (const fn of Object.values(sentryFns)) fn.mockReset?.();
  sentryFns.captureException.mockReturnValue("fake-event-id");
  sentryFns.captureMessage.mockReturnValue("fake-event-id");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("error-report", () => {
  it("captureException does not throw on any input shape", () => {
    expect(() => captureException(new Error("x"))).not.toThrow();
    expect(() => captureException("a string")).not.toThrow();
    expect(() => captureException({ weird: "object" })).not.toThrow();
    expect(() => captureException(null)).not.toThrow();
    expect(() => captureException(undefined)).not.toThrow();
  });

  it("captureException forwards a typed context to the Sentry SDK", () => {
    captureException(new Error("boom"), {
      school_id: "s1",
      user_id: "u1",
      route: "/api/test",
      method: "POST",
      tags: { feature: "fees" },
      extra: { account_id: "abc" },
    });
    expect(sentryFns.captureException).toHaveBeenCalledOnce();
    expect(sentryFns.setTag).toHaveBeenCalledWith("school_id", "s1");
    expect(sentryFns.setTag).toHaveBeenCalledWith("route", "/api/test");
    expect(sentryFns.setTag).toHaveBeenCalledWith("http.method", "POST");
  });

  it("captureMessage does not throw and accepts a level", () => {
    expect(() => captureMessage("hello", { level: "warning" })).not.toThrow();
    expect(sentryFns.captureMessage).toHaveBeenCalledOnce();
  });

  it("addBreadcrumb does not throw", () => {
    expect(() => addBreadcrumb("test", "msg", { foo: 1 })).not.toThrow();
    expect(sentryFns.addBreadcrumb).toHaveBeenCalledOnce();
  });

  it("captureErrors captures and re-throws", async () => {
    await expect(
      captureErrors(async () => {
        throw new Error("inner");
      }, { route: "/x" }),
    ).rejects.toThrow("inner");
    expect(sentryFns.captureException).toHaveBeenCalledOnce();
  });
});

