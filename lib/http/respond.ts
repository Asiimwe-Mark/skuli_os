/**
 * Re-exports the response envelope helpers from `@/lib/api-helpers` so
 * that route files have a single import surface (`@/lib/http`).
 *
 * Also adds two thin conveniences that compose those primitives:
 *
 *   respond.status(201, data)   - 201 + { success, data } envelope
 *   respond.cacheable(value)    - 200 + { success, data } + the shared
 *                                 browser-cache Cache-Control header
 *                                 (set by audit section B2; do not change
 *                                 without re-reading that section)
 *
 * Why these wrappers exist
 * ------------------------
 * Without them, route handlers do:
 *
 *     return successResponse(data, 201);
 *
 * Which is fine but means every route re-implements "default to no-store"
 * from `successResponse` and risks accidentally passing the cacheable flag.
 * `respond.status` and `respond.cacheable` make the intent explicit at
 * the call site, and keep the default (`no-store`) consistent.
 */

import {
  CACHEABLE_CACHE_CONTROL,
  errorResponse,
  paginatedResponse,
  successResponse,
} from "@/lib/api-helpers";
import type { PaginatedEnvelope } from "@/lib/api-helpers";

export {
  CACHEABLE_CACHE_CONTROL,
  errorResponse,
  paginatedResponse,
  successResponse,
};
export type { PaginatedEnvelope };

const respond = {
  /**
   * Wrap a value in the standard `{ success, data }` envelope with an
   * explicit status. Cache-Control defaults to `no-store` (per audit B2)
   * - auth-scoped data must never be cached by the browser by accident.
   */
  status<T>(status: number, data: T): Response {
    return successResponse(data, status);
  },

  /**
   * Wrap a value in the standard envelope with the shared cacheable
   * Cache-Control header. Used for read endpoints that went through
   * `withSchoolReadCache` and want the browser-cache window of 30 s
   * (with 60 s SWR) to apply.
   *
   * Callers must NOT use this on endpoints that return user-specific
   * data without also going through the school-scoped cache layer -
   * otherwise one student's data could be cached and served to another.
   */
  cacheable<T>(data: T): Response {
    return successResponse(data, 200, { cacheable: true });
  },
};

export { respond };
export const CACHEABLE_HEADER_VALUE = CACHEABLE_CACHE_CONTROL;
