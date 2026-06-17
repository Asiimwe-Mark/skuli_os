import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchJson,
  fetchEnvelope,
  fetchArray,
  fetchPaginated,
  ApiError,
} from "@/lib/api-fetch";

/**
 * Gate tests for the client-side API fetch helpers.
 *
 * The big regression these cover is the wave of
 *   "xxx.map is not a function" / "xxx.filter is not a function" /
 *   "xxx.find is not a function" / "xxx.reduce is not a function"
 * crashes that came from pages reading `json.data` and calling array
 * methods on it when the server returned a paginated envelope
 * ({ data: { items, total, page, ... } }) instead of a plain array.
 * The helpers normalise every response shape to a guaranteed array
 * (or to the original `data` payload, when the caller wants it).
 */

const originalFetch = global.fetch;

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed body and status on 2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ hello: "world" }, 200),
    );
    const { body, status } = await fetchJson("/api/x");
    expect(body).toEqual({ hello: "world" });
    expect(status).toBe(200);
  });

  it("throws ApiError on non-2xx with the envelope's error message", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: "nope" }, 400),
    );
    await expect(fetchJson("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "nope",
    });
  });

  it("falls back to statusText when no envelope error is present", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("not-json", { status: 500, statusText: "Server Error" }),
    );
    await expect(fetchJson("/api/x")).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("fetchEnvelope", () => {
  it("returns data on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: { a: 1 } }, 200),
    );
    expect(await fetchEnvelope<{ a: number }>("/api/x")).toEqual({ a: 1 });
  });

  it("throws when success !== true", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: "Forbidden" }, 403),
    );
    await expect(fetchEnvelope("/api/x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchArray", () => {
  it("returns a plain array unchanged", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: [1, 2, 3] }, 200),
    );
    expect(await fetchArray<number>("/api/x")).toEqual([1, 2, 3]);
  });

  it("returns [] when data is null", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: null }, 200),
    );
    expect(await fetchArray("/api/x")).toEqual([]);
  });

  // This is the regression: the API returns a paginated envelope
  // { data: { items, total, page, ... } } and the page used to do
  // `json.data.map(...)` which crashed.
  it("unwraps a paginated { items: [] } envelope to the array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: true,
          data: {
            items: [1, 2, 3],
            total: 3,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
        },
        200,
      ),
    );
    expect(await fetchArray<number>("/api/x")).toEqual([1, 2, 3]);
  });

  it("unwraps a { students: [] } envelope", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: true,
          data: { students: [{ id: "a" }], total: 1, page: 1 },
        },
        200,
      ),
    );
    expect(await fetchArray<{ id: string }>("/api/x")).toEqual([{ id: "a" }]);
  });

  it("unwraps a { books: [] } envelope (library case)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        { success: true, data: { books: [{ id: "b1" }], total: 1 } },
        200,
      ),
    );
    expect(await fetchArray<{ id: string }>("/api/x")).toEqual([{ id: "b1" }]);
  });

  it("returns [] for an object that has no array field", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: { foo: "bar" } }, 200),
    );
    expect(await fetchArray("/api/x")).toEqual([]);
  });

  it("throws ApiError on failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: "Unauthorized" }, 401),
    );
    await expect(fetchArray("/api/x")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });
});

describe("fetchPaginated", () => {
  it("returns the envelope shape untouched", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: true,
          data: {
            items: [{ id: "1" }, { id: "2" }],
            total: 2,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
        },
        200,
      ),
    );
    const out = await fetchPaginated<{ id: string }>("/api/x");
    expect(out.items).toEqual([{ id: "1" }, { id: "2" }]);
    expect(out.total).toBe(2);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(50);
    expect(out.totalPages).toBe(1);
  });

  it("wraps a bare array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: [1, 2, 3] }, 200),
    );
    expect(await fetchPaginated<number>("/api/x")).toEqual({
      items: [1, 2, 3],
      total: 3,
      page: 1,
      limit: 3,
      totalPages: 1,
    });
  });

  it("falls back to empty when data is malformed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: null }, 200),
    );
    expect(await fetchPaginated("/api/x")).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      totalPages: 0,
    });
  });
});
