/**
 * Client-side fetch helpers for the standard `{ success, data }` envelope
 * returned by every /api route.
 *
 * Why this exists
 * ---------------
 * Server routes uniformly return either:
 *   - { success: true,  data: <T> }        for plain list endpoints
 *   - { success: true,  data: { items, total, page, ... } }  for paginated endpoints
 *   - { success: false, error: <string> }   on any failure
 *
 * Pages used to do `const json = await res.json(); return json.data || []`
 * and then call `.map` / `.filter` / `.find` / `.reduce` on the result.
 * When the API happened to return a paginated envelope (where `data` is
 * `{ items, total, ... }`, not an array) the page tried to call array
 * methods on the envelope object and crashed with
 *   - `xxx.map is not a function`
 *   - `xxx.filter is not a function`
 *   - `xxx.find is not a function`
 *   - `xxx.reduce is not a function`
 *
 * These helpers extract the `data` field, normalise it to a plain array
 * when the caller asked for one, and throw a typed `ApiError` on failure.
 * Every page that hits /api should go through these.
 */

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Lower-level: fetch + parse, return the parsed body. Throws ApiError on
 * non-2xx. Caller decides what to do with `body`.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ body: T; status: number }> {
  const res = await fetch(input, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Empty / non-JSON body. Still throw on non-2xx.
  }
  if (!res.ok) {
    const env = body as Envelope<unknown> | null;
    const message =
      (env && typeof env.error === "string" && env.error) ||
      res.statusText ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return { body: body as T, status: res.status };
}

/**
 * Unwrap the standard envelope. Returns the `data` field as-is, or
 * throws ApiError on a `{ success: false }` response.
 */
export async function fetchEnvelope<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const { body, status } = await fetchJson<Envelope<T>>(input, init);
  if (!body || body.success !== true) {
    const message =
      (body && typeof body.error === "string" && body.error) ||
      "Request failed";
    throw new ApiError(message, status, body);
  }
  return body.data as T;
}

/**
 * Fetch a list endpoint and guarantee an array. Handles all three cases
 * the API uses:
 *   - data is a plain array  -> returned as-is
 *   - data is an envelope    -> unwraps first matching array field
 *   - data is null/undefined -> returns []
 */
export async function fetchArray<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T[]> {
  const data = await fetchEnvelope<unknown>(input, init);
  if (Array.isArray(data)) return data as T[];
  if (data == null) return [];
  if (typeof data === "object") {
    // Common paginated envelope shapes: {items:[]}, {data:[]},
    // {students:[]}, {staff:[]}, {payments:[]}, {threads:[]}, {books:[]},
    // {results:[]}, {rows:[]}, {records:[]}.
    const obj = data as Record<string, unknown>;
    for (const key of [
      "items",
      "data",
      "students",
      "staff",
      "payments",
      "threads",
      "books",
      "results",
      "rows",
      "records",
    ]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/**
 * Fetch a paginated envelope. Always returns the same shape
 * `{ items, total, page, limit, totalPages }`. If the server returned
 * a plain array, wrap it.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchPaginated<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Paginated<T>> {
  const data = await fetchEnvelope<unknown>(input, init);
  if (Array.isArray(data)) {
    return {
      items: data as T[],
      total: data.length,
      page: 1,
      limit: data.length,
      totalPages: 1,
    };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const arrKey = ["items", "data", "students", "staff", "payments", "books", "threads", "results", "rows", "records"].find(
      (k) => Array.isArray(obj[k]),
    );
    const items = (arrKey ? (obj[arrKey] as T[]) : []) ?? [];
    const total = typeof obj.total === "number" ? obj.total : items.length;
    const page = typeof obj.page === "number" ? obj.page : 1;
    const limit = typeof obj.limit === "number" ? obj.limit : items.length;
    const totalPages =
      typeof obj.totalPages === "number"
        ? obj.totalPages
        : Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, totalPages };
  }
  return { items: [], total: 0, page: 1, limit: 0, totalPages: 0 };
}
