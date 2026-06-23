// The single import surface for every `app/api/**/route.ts` file.
// See `docs/ROUTE_REFACTOR_MIGRATION.md` for the contract:
//   - `route` is the auth + RBAC + body-validation + error-envelope wrapper
//   - `publicRoute` is for routes that do NOT authenticate through Supabase
//     (webhooks, OAuth callbacks, the SMS outbox worker)
//   - `respond` composes the standard envelopes (`status`, `cacheable`)
//   - `withSchoolReadCache` is the per-school cache helper that also
//     stamps `x-skuli-cache`
//   - `scopedQuery` / `crossTenantQuery` / `paginated` / `escapeIlike` /
//     `searchFilter` remove the per-route boilerplate for school
//     scoping, pagination, and safe ilike interpolation
//   - `invalidateSchoolAsync` is the fire-and-forget variant of
//     `invalidateSchool` — use it on every mutation handler

export { route, publicRoute, SUPER_ADMIN_SENTINEL } from "./route";
// Re-export the augmented AuthContext under its canonical name.
// The base AuthContext from api-helpers is also exported as
// `BaseAuthContext` for the rare case a service needs the
// narrower type (e.g. a test that constructs the context
// manually). Importers should default to `AuthContext` from
// this module.
export type { AuthContext, Role } from "./route";
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
export {
  scopedQuery,
  crossTenantQuery,
  paginated,
  escapeIlike,
  searchFilter,
  searchParam,
} from "./scoped";
// Re-exported from @/lib/api-helpers so route files have a single
// import surface for everything the wrapper composes on their
// behalf (auth, db error mapping, etc.).
export { AuthError, dbError, getErrorStatus, handleRouteError, requireSchool, requireRole } from "@/lib/api-helpers";
export { invalidateSchool, invalidateSchoolAsync, setCacheHeader } from "@/lib/api-cache";
// Base AuthContext for tests / library code that needs to
// construct a context manually (without the route wrapper's
// schoolId augmentation).
export type { AuthContext as BaseAuthContext } from "@/lib/api-helpers";
