import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ---------------------------------------------------------------
  // Architecture guardrails (analysis findings A2 / A3 + audit P2 +
  // refactor A-to-Z).
  //
  // A2: pages must not query Postgres directly via the browser
  //     Supabase client (`.from(...)`). All reads/writes go through
  //     the /api layer so role checks, zod validation, audit logging
  //     and the Redis cache are applied uniformly.
  // A3: pages must not build React Query keys inline. Use the
  //     centralised `queryKeys` factory from lib/query-keys.ts so
  //     keys always include school id and invalidation stays
  //     consistent across tenants.
  //
  // P2 (route refactor): route handlers must not import the raw
  //     `@supabase/supabase-js` client. The only acceptable path
  //     for getting a server client is `@/lib/supabase/server` (the
  //     service-role client) or, for authenticated handlers, the
  //     AuthContext returned by `route()`.
  //
  //     Route handlers must also not import `errorResponse`,
  //     `successResponse`, `requireRole`, `requireSchool`,
  //     `getErrorStatus`, `handleRouteError`, or `AuthError` from
  //     `@/lib/api-helpers` directly. The wrapper at `@/lib/http`
  //     composes all of those: handlers declare `roles`/`schema`
  //     and throw `AuthError` (or return a value) — they never call
  //     the helpers. This rule makes the contract hard: any new
  //     `app/api/**/route.ts` that hand-rolls auth + RBAC + body
  //     validation + error envelope will fail lint on save.
  //
  // A-to-Z refactor: additional rules preventing the four most
  //     common drift patterns the audit flagged across 30+
  //     route handlers:
  //       • `ctx.profile.school_id` — use `ctx.schoolId` instead.
  //       • Direct inserts into `audit_logs` or
  //         `in_app_notifications` — use `writeAuditLog` /
  //         `withAudit` / `dispatchNotifications` / `emitInApp`.
  //       • `await invalidateSchool(...)` on the request path —
  //         use `invalidateSchoolAsync` (fire-and-forget).
  //       • Inline pagination parsing — use `paginated.parse`.
  // ---------------------------------------------------------------
  {
    files: ["app/**/page.tsx", "app/**/layout.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from']",
          message:
            "Do not query Supabase directly from page components (analysis A2). Fetch through the /api layer instead.",
        },
        {
          selector:
            "Property[key.name='queryKey'][value.type='ArrayExpression']",
          message:
            "Do not use inline queryKey arrays in pages (analysis A3). Use the queryKeys factory from @/lib/query-keys.",
        },
      ],
    },
  },
  {
    files: ["app/api/**/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message:
                "Route handlers must not import @supabase/supabase-js directly (audit P2). Get the client from AuthContext returned by route(), or use @/lib/supabase/server for service-role work.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/api-helpers"],
              message:
                "Route handlers must use @/lib/http instead of @/lib/api-helpers (audit P2 / migration guide §3). The wrapper composes auth + RBAC + body validation + error envelope; handlers throw AuthError or return values, never call these helpers directly.",
            },
          ],
        },
      ],
      // A-to-Z refactor guards. Each selector targets a specific
      // pattern the audit found drift on across 30+ handlers.
      "no-restricted-syntax": [
        "error",
        {
          // `ctx.profile.school_id` (with or without `!`) — the
          // route wrapper now exposes `ctx.schoolId` non-null for
          // every handler, so this lookup is redundant.
          selector:
            "MemberExpression[object.property.name='profile'][property.name='school_id']",
          message:
            "Use ctx.schoolId instead of ctx.profile.school_id!. The route() wrapper populates ctx.schoolId with a non-null string for every authenticated handler.",
        },
        {
          // `ctx.supabase.from("audit_logs").insert(...)` — bypasses
          // the typed writeAuditLog helper and the audit_logs
          // append-only trigger that the migration just installed.
          selector:
            "CallExpression[callee.property.name='from'][callee.object.name='supabase'][arguments.0.value='audit_logs']",
          message:
            "Do not insert into audit_logs directly. Use writeAuditLog() or withAudit() from @/lib/audit-log so the audit_logs append-only invariants stay enforced.",
        },
        {
          // `ctx.supabase.from("in_app_notifications").insert(...)`
          // — bypasses the dual-write (notification_logs + bell icon)
          // that dispatchNotifications() / emitInApp() guarantee.
          selector:
            "CallExpression[callee.property.name='from'][callee.object.name='supabase'][arguments.0.value='in_app_notifications']",
          message:
            "Do not insert into in_app_notifications directly. Use dispatchNotifications() from @/lib/services/notifications, or the emit_in_app_notification() RPC after migration 0047.",
        },
        {
          // `await invalidateSchool(schoolId)` on the request path —
          // blocks the response on a Redis SCAN+DEL. Use the async
          // variant so the invalidation runs on the next tick.
          selector:
            "AwaitExpression > CallExpression[callee.name='invalidateSchool']",
          message:
            "Do not await invalidateSchool on the mutation path; use invalidateSchoolAsync (fire-and-forget) so the cache invalidation does not block the response.",
        },
        {
          // Manual page/limit parsing — use paginated.parse from
          // @/lib/http/scoped.
          selector:
            "VariableDeclarator > CallExpression[callee.name='parseInt'][arguments.0.callee.property.name='get'][arguments.0.callee.object.callee.name='URL']",
          message:
            "Use paginated.parse(request) from @/lib/http instead of inline parseInt(searchParams.get('page')). The helper enforces the 200-row MAX_LIMIT and safe fallbacks.",
        },
      ],
    },
  },
]);

export default eslintConfig;
