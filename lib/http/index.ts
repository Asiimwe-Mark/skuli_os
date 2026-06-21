// The single import surface for every `app/api/**/route.ts` file.
// See `docs/ROUTE_REFACTOR_MIGRATION.md` for the contract:
//   - `route` is the auth + RBAC + body-validation + error-envelope wrapper
//   - `publicRoute` is for routes that do NOT authenticate through Supabase
//     (webhooks, OAuth callbacks, the SMS outbox worker)
//   - `respond` composes the standard envelopes (`status`, `cacheable`)
//   - `withSchoolReadCache` is the per-school cache helper that also
//     stamps `x-skuli-cache`

export { route, publicRoute } from "./route";
export { respond } from "./respond";
export { withSchoolReadCache } from "./with-cache";
export type { ReadCacheKey, ReadCacheResult } from "./with-cache";
export {
  CACHEABLE_CACHE_CONTROL,
  CACHEABLE_HEADER_VALUE,
  errorResponse,
  paginatedResponse,
  successResponse,
} from "./respond";
export type { PaginatedEnvelope } from "./respond";
// Re-exported from @/lib/api-helpers so route files have a single
// import surface for everything the wrapper composes on their
// behalf (auth, db error mapping, etc.).
export { AuthError, dbError, getErrorStatus, handleRouteError, requireSchool, requireRole } from "@/lib/api-helpers";
export { invalidateSchool, setCacheHeader } from "@/lib/api-cache";
export type { AuthContext } from "@/lib/api-helpers";
