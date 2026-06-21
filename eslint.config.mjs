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
  // Architecture guardrails (analysis findings A2 / A3 + audit P2).
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
    },
  },
]);

export default eslintConfig;
