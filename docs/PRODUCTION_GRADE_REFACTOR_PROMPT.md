# SKULI OS — Production-Grade Refactor Prompt

> **Purpose.** This is a single, self-contained prompt you (a developer or an AI agent) can paste into Claude Code, Cursor, or any senior-engineer-role LLM session to take the SKULI OS codebase from "scaffolded + partially hardened" to "production grade." It is the only context the executing model needs.
>
> **Inputs the model must read before doing anything else.**
> 1. The architecture review produced by the audit pass (this lives in the team wiki at `docs/ARCHITECTURE_REVIEW.md` — see §A1 for the canonical content; if that file is absent, read the conversation log that produced the review and recreate it).
> 2. `docs/ROUTE_REFACTOR_MIGRATION.md` — the step-by-step migration playbook this prompt references throughout.
>
> **Operating principles.** Every change must be **behaviour-preserving**. Same wire format, same DB calls, same status codes, same audit log entries, same cache behaviour, same user-visible behaviour. We are paying down technical debt, not adding features. If a refactor risks changing behaviour, stop and ask.

---

## 0 · Mission

Take the SKULI OS multi-tenant school-management SaaS to production grade by addressing the issues identified in the architecture review. The codebase already has a hardened foundation (env validation, Sentry wrapper, Redis cache, query-key factory, audit logger, RBAC middleware). The work is to:

1. **Apply** what's already in the foundation consistently.
2. **Extract** business logic out of the HTTP layer so it can be tested.
3. **Standardise** the API surface, the page data layer, the cache invalidation, the SMS dispatch, and the store.
4. **Add the missing tests**, then the missing observability, then the missing security gates.

The acceptance criteria are in §10. Do not declare the work done until every box is ticked.

---

## 1 · Project Snapshot (read this first — no need to re-discover)

### 1.1 Stack

Next.js 16 App Router · React 19 · Supabase (Postgres + RLS + Auth + Realtime + Storage) · TanStack Query 5 · Zustand 5 · Africa's Talking (SMS + mobile money) · Pesapal 3.0 (payments + B2C disbursements) · Resend (email) · @react-pdf/renderer · Sentry 10 · Upstash Redis (cache + rate limit).

### 1.2 Topology

- **Edge** — `middleware.ts` + `lib/supabase/middleware.ts`: Supabase session refresh, role-based section redirects, cookie-rotation safety. Public routes: `/`, `/login`, `/onboard`, `/api/auth/*`, `/api/onboard`, `/api/webhooks/*`.
- **Server** — `app/api/**/route.ts` (111 routes across 35 modules). Zod-validated, returns `{ success, data | error }` envelope.
- **Persistence** — 30+ Supabase migrations, RLS for tenant isolation, SECURITY DEFINER RPCs for privileged paths.
- **Client** — Zustand for session-scoped context (`store/school.ts`); TanStack Query for data fetching, keyed by `queryKeys` factory.

### 1.3 Scale

385 TS/TSX files, 111 API routes, 87 pages, 35 API modules, 47 components. A handful of foundational helpers (`api-helpers`, `api-cache`, `error-report`, `audit-log`, `env`, `query-keys`) are well-written but inconsistently applied.

### 1.4 The two co-existing styles

The codebase has two patterns for the same job:

- **Hardened** — `route()` wrapper (when present), `handleRouteError`, `dbError`, `writeAuditLog`, `withSchoolCache`, `invalidateSchool`, `queryKeys` factory.
- **Legacy** — direct `getSupabaseAndUser` + `requireRole` + `err.message → errorResponse` try/catch, ad-hoc query keys, `as unknown as Database["…"]` casts, `console.error` instead of Sentry, silent `try { } catch {}` in handlers, direct `supabase.from(...)` calls in client pages.

Most routes use a mix of both. The refactor collapses the legacy patterns to the hardened ones, with zero functional change.

---

## 2 · Constraints (non-negotiable)

1. **No new dependencies** unless explicitly approved in §6 of the architecture review. The current set is intentional.
2. **No DB migrations** unless the change is unavoidable (the SMS outbox needs one — see §5.5). Every other change is application code only.
3. **Wire format is sacred.** Every API response remains `{ success, data }` or `{ success, false, error }`. Every status code is preserved. Every cache header is preserved.
4. **Behaviour is sacred.** A request that returns 201 today returns 201 after the refactor. A user with `SCHOOL_ADMIN` role who can call `/api/fees/expenses` today can still call it. A push notification that fires on attendance submission still fires.
5. **Tests are non-optional.** A change that breaks `lib/api-helpers.test.ts`, `lib/audit-log.test.ts`, `lib/error-report.test.ts`, `lib/marks-validation.test.ts`, `lib/query-persist.test.ts`, or `lib/api-fetch.test.ts` is a regression and must be fixed before the PR is considered mergeable.
6. **`tsc --noEmit` is non-optional.** Pre-existing errors in the tree are out of scope; **new** errors introduced by a refactor must be fixed in the same PR.
7. **The `.env.local` in the repo is real.** Treat it as a secret. Do not log it, do not paste it, do not commit it (already in `.gitignore`).

---

## 3 · The 10 Critical Problem Areas (from the architecture review)

These are the targets. Every refactor PR must map to one or more of these.

1. **P1 — Mixed error-handling idioms** (78 of 111 routes use the leaky `err.message → errorResponse` pattern). Fix: collapse to `handleRouteError` via the `route()` wrapper.
2. **P2 — Auth/RBAC in two places, drifting** (`requireRole` is opt-in, many routes rely on RLS alone). Fix: `route({ roles: [...] })` makes RBAC a contract.
3. **P3 — Cache invalidation is correct but coarse** (`invalidateSchool` blasts everything). Fix: tag-based cache.
4. **P4 — Page-level data fetching bypasses the API** (some pages call `supabase.from` directly). Fix: ESLint rule + central page-fetch hooks.
5. **P5 — SMS dispatch is a single-threaded loop** (200 recipients = 20s request). Fix: outbox + worker.
6. **P6 — Zustand store has alias sprawl** (`term` and `currentTerm` both exist). Fix: drop aliases.
7. **P7 — `app/api/v1/*` duplicates `/api/*`** (three payment-initiate endpoints). Fix: collapse to one canonical path.
8. **P8 — No DTO layer** (pages hand-unwrap PostgREST joins). Fix: `types/dto/*` + mappers.
9. **P9 — Tests are sparse** (no route handler tested). Fix: per-service unit tests + a smoke test harness.
10. **P10 — Inconsistent `error.tsx`/`loading.tsx`** (some pages flash, some don't). Fix: standard skeleton + error boundary.

The migration guide in `docs/ROUTE_REFACTOR_MIGRATION.md` is the executable plan for **P1, P2, P4, P8, P9 (partial), and P10 (partial)**. The remaining problems (P3, P5, P6, P7, P9 service tests) are addressed in §5 of this prompt.

---

## 4 · PR Plan (10 PRs, each independently mergeable)

Each PR ends with: `npx tsc --noEmit` clean, `npx vitest run` green, `npm run build` successful, no new lint errors, a smoke test (log in as one of each role, click around, no regressions).

### PR 1 — `lib/http/` scaffolding + ESLint guard (no route changes)

**Files to add (5):**
- `lib/http/route.ts` — the `route()` wrapper with two TypeScript overloads (one for handlers with a `schema`, one without) and a single implementation function below them. **Do not use the conditional generic form** — it loses narrowing and every caller will need explicit type arguments. The two overloads must be the *only* exported signatures of `route`. Also export `publicRoute` and `respond` (with `respond.status` and `respond.cacheable`).
- `lib/http/respond.ts` — re-export `successResponse`, `errorResponse`, `paginatedResponse`, `CACHEABLE_CACHE_CONTROL`, and the `PaginatedEnvelope` type from `@/lib/api-helpers`.
- `lib/http/with-cache.ts` — `withSchoolReadCache` wraps `withSchoolCache` and returns `{ value, hit, applyTo }` so the handler can set the `x-skuli-cache` header in one place.
- `lib/http/index.ts` — barrel. The only import a route file should need is `import { route, respond, withSchoolReadCache } from "@/lib/http"`.
- `lib/http/route.test.ts` — vitest covering: (a) handler with schema gets typed body, (b) handler without schema gets `(ctx, req)`, (c) 401 when no user, (d) 403 when role mismatch, (e) 400 on schema failure, (f) generic 500 on thrown error (no leakage), (g) `respond.status(201, x)` produces 201, (h) `respond.cacheable(x)` produces the cacheable Cache-Control header.

**Files to modify (1):**
- `eslint.config.mjs` — add a `no-restricted-imports` rule for `app/api/**` banning direct `@supabase/supabase-js` import (must go through `@/lib/supabase/server` or the auth helper).

**The full wrapper code is in the architecture review, §4.1.** Use the **overload** form, not the conditional generic form. The implementation signature must be the explicit `(opts: { roles, schema?, noSchoolRequired?, handler })` shape with `handler: (ctx, ...rest: unknown[]) => Promise<unknown>` — the body internally casts to call the typed handler.

**Acceptance:**
- `lib/http/` compiles standalone.
- `npx vitest run lib/http/route.test.ts` is green.
- `npx tsc --noEmit` shows no new errors anywhere in the tree.
- No route file is touched.
- ESLint guard is live but reports zero violations (the existing tree is still on the legacy pattern).

### PR 2 — Refactor the 4 simplest routes (template for the team)

**Routes:** `academic-years`, `terms`, `classes`, `calendar`.

**Why these four:** pure reads, no schema, no body, no side effects. They are the smallest example of every shape the team will see, so they double as the team's reference PR.

**Per-route mechanical steps** (this is the pattern; the migration guide has it in full):
1. Read the current file.
2. Identify the auth/role prelude (`getSupabaseAndUser`, `requireSchool`, `requireRole`).
3. Identify the trailing `try { ... } catch (err: unknown) { return errorResponse(...) }` — delete it, the wrapper handles errors.
4. Identify the body of the read.
5. Replace the export with `export const GET = route({ roles: [...], handler: async (ctx, request) => { ... return data; } })`.
6. If the route uses `withSchoolCache` + `setCacheHeader`, replace with `await withSchoolReadCache({...}, async () => ...)` and `return respond.cacheable(value)`.
7. Delete the now-unused imports.

**Acceptance:** `npx tsc --noEmit` clean, `npx vitest run` green, `curl` smoke test on one of the four routes (signed in as a SCHOOL_ADMIN) returns the same payload as before.

### PR 3 — Refactor batch-1 read-only routes (no schema)

The migration guide lists the ~20 routes. All are GET-only, no body, no schema. Mechanical application of the PR 2 pattern. Include a `curl` smoke test in the PR description showing one route per domain (e.g. `marketplace`, `group/schools`, `referral/code`) returns the expected shape.

### PR 4 — Refactor batch-2 read-with-body routes (POST for filters)

`analytics/custom-report`, `analytics/emis/pdf`, `analytics/emis/xlsx`, `reports/discipline-summary`, `fees/statements`. These POST because they accept a filter body. The pattern is the PR 2 template with `schema: z.object({...})` and the handler signature `(ctx, body, request)`.

### PR 5 — Refactor `fees/*` and `students/*`

`fees/payments`, `fees/accounts`, `fees/structure`, `fees/structure/[id]`, `fees/discounts`, `fees/expenses`, `fees/expenses/categories`, `fees/student-discounts`, `fees/generate-accounts`, `fees/stk-push`, `students`, `students/[id]`, `students/alumni`, `students/bulk-import`, `students/bulk-import/preview`, `staff`, `staff/[id]`, `staff/payroll/run`, `academics/marks`, `academics/report-cards/generate`, `academics/report-cards/publish`. Schema-driven. The biggest PR by LOC; split into two if it exceeds ~600 lines of diff.

### PR 6 — Refactor `attendance/*`, `library/*`, `assets/*`, `discipline/*`, `meetings/*`, `timetable/*`, `teacher/*`, `settings/*`, `payments/*`, `calendar/*`, `terms/*`, `academic-years/*`, `classes/*`

Schema-driven. All wrap with `route({ roles, schema, handler })`. No new behaviour, just consistent envelope.

### PR 7 — Refactor `admin/*`, `group/*`, `v1/*`

All use `noSchoolRequired: true`. `v1/*` stays under its own URL prefix for this PR (we collapse it in PR 10).

### PR 8 — Refactor `communication/*`, `portal/*`, `push/*`, `concierge/*`, `marketplace/*`, `referral/*`, `onboard/*`, `users/*`, `billing/*`, `auth/callback`, `reports/*`

`auth/callback`, `onboard`, `referral/*`, `concierge/request` are **public** — use `publicRoute`. `push/process-queue` is a **worker** — also `publicRoute`, kept under its own block with a clear comment that it must not be authenticated. The remaining routes are `route({...})` with the usual pattern.

### PR 9 — Refactor webhooks to `publicRoute` (4 routes)

`/api/webhooks/pesapal`, `/api/webhooks/africas-talking/sms`, `/api/webhooks/africas-talking/mm`, plus `/api/africas-talking/test`. The wrapper is `publicRoute` because they don't go through Supabase auth — they carry HMAC. The `x-skuli-cache` middleware match in `middleware.ts` must be re-verified after this PR; the webhooks already bypass auth at the middleware level, so the change is route-internal only.

### PR 10 — Cleanup pass

- Collapse `/api/v1/*` URLs into `/api/*` with a `?v=1` query string check on a single deprecation shim. Delete the `v1/` directory after one release.
- Trim Zustand aliases (`term` / `academicYear`) — keep only `currentTerm` / `currentAcademicYear`. Read `userRole` from `user.role`. Run `grep -rn "\.term\b\|\.academicYear\b" app store` and fix any remaining references. Add a CI grep that fails if either alias returns to the tree.
- Add a top-level `error.tsx` in `app/` and per-section `error.tsx` in `app/dashboard/`, `app/portal/`, `app/teacher/`, `app/admin/`, `app/group/`. Each renders `<SectionError />` from `components/shared/section-error.tsx`. Add `loading.tsx` to every `page.tsx` that does not already have one — render a Skeleton that matches the page's expected shape.
- Update the README to document the new import surface (`@/lib/http`) and the `route()` contract.
- Add a CI step that runs `npm run typecheck && npm run lint && npm run test && npm run build` on every PR. This is the gate.

---

## 5 · The other refactors (parallel to PRs 1–10)

PRs 1–10 cover P1, P2, P4, P7, P8, P10. The remaining four problems (P3, P5, P6, P9) are independent and can land in any order. They do not block the route refactor.

### 5.1 Tag-based cache (P3)

**Why now.** `invalidateSchool` is fine for one mutation per minute per school. With 100+ schools and high read traffic, the school-wide blast becomes a thundering herd on every write.

**The change.** Replace the flat `skuli:cache:<school>:<shape>` key with `skuli:cache:<school>:<shape>` plus a reverse index `skuli:tag:<school>:<tag>` containing the cache keys that carry that tag. Mutations call `invalidateTags(schoolId, ['fees', 'dashboard'])` instead of `invalidateSchool(schoolId)`. Tags are declared on the read.

**Where it lives.** `lib/api-cache.ts` (additive — keep the old API for back-compat during the migration, delete after 6 months).

**PR plan:**
- PR-A: add `withTaggedCache` + `invalidateTags` to `lib/api-cache.ts`. Old `withSchoolCache` and `invalidateSchool` keep working unchanged. Tests in `lib/api-cache.test.ts`.
- PR-B: migrate one read route (e.g. `/api/fees/accounts`) and its corresponding mutation (`/api/fees/accounts` PATCH) to the new API. Declare tags `['fees', 'dashboard']` on the read, invalidate those tags on the mutation. Confirm `x-skuli-cache: hit` after the first call.
- PR-C: migrate the remaining read routes incrementally. One route per commit so a regression is easy to bisect.

**Acceptance:** the smoke test from PR 2 still passes; `redis-cli KEYS 'skuli:cache:*'` shows the same key count as before for any single mutation; `redis-cli KEYS 'skuli:tag:<school>:fees'` shows only the read keys that carry the `fees` tag.

### 5.2 SMS outbox (P5)

**Why now.** A 200-recipient broadcast currently takes ~20s and ties up a Node worker. Outages cascade.

**The change.**
1. Migration `0031_sms_outbox.sql` (only if not already present): a new table `sms_outbox` with `(id, school_id, recipient_phone, message, cost_ugx, status, attempts, last_attempt_at, sent_at, error, created_at)`. RLS-locked: only the service role can SELECT/INSERT. Status enum: `pending | sending | sent | failed`.
2. New service `lib/services/sms-enqueue.ts` — `enqueueSms(jobs: SmsJob[])` does one batched INSERT.
3. New service `lib/services/sms-worker.ts` — `processOutboxBatch(limit = 50)` selects `pending` rows with `FOR UPDATE SKIP LOCKED`, marks them `sending`, calls `sendSms` with bounded concurrency (`p-limit(10)`), updates rows to `sent` or `failed`, and decrements the school's spend cap.
4. `/api/communication/send` calls `enqueueSms` and returns `202 { queued: N }` immediately. The existing 100ms-per-message loop is deleted.
5. `/api/push/process-queue` is extended to drain the SMS outbox after its existing push-queue work. Cron-friendly: `*/1 * * * *` triggers it.

**Acceptance:** a 200-recipient broadcast completes in <500ms; the outbox drains within 60s of cron tick; the spend cap is still respected (the worker re-checks before each send); existing `/api/communication/sms-balance` still works; `sms_logs` table is still populated for the audit trail.

### 5.3 Store cleanup (P6)

**Why now.** Alias sprawl is a footgun. `setUser` secretly setting `userRole` is a side-effect nobody reads.

**The change.** In `store/school.ts`:
- Delete `term` and `academicYear` aliases. Keep only `currentTerm` and `currentAcademicYear`.
- Delete `setUserRole`. Read role from `user.role` everywhere. Grep for `useSchoolStore((s) => s.userRole)` and update each call site to `useSchoolStore((s) => s.user?.role ?? null)`.
- Replace `setSchool`, `setCurrentTerm`, `setCurrentAcademicYear`, `setUser`, `setGroup` with a single `setContext({ school, currentTerm, currentAcademicYear, user, group })` that updates all five atomically. The previous individual setters are kept for back-compat but emit a deprecation console warning.

**Acceptance:** `grep -rn "\.term\b" app store components` returns zero results; `grep -rn "\.academicYear\b" app store components` returns zero results; `npx tsc --noEmit` clean; manual smoke test in `/dashboard` and `/portal` confirms the context still loads.

### 5.4 Service layer + tests (P9)

**Why now.** 111 routes is too much code per file. The 150-line business logic in `POST /api/fees/payments` should be a 30-line route calling `lib/services/fees/record-payment.ts` which is unit-testable with a mocked Supabase.

**The change.** For each domain, extract a service module. The pattern:

```
lib/services/<domain>/
├── record-payment.ts
├── send-sms.ts
├── publish-report-card.ts
└── _test-helpers.ts  // fixtures + a mock Supabase client
```

Each service:
- Takes a `ctx: AuthContext` and a typed input.
- Returns a typed output.
- Performs all DB calls.
- Performs the audit log write.
- Does NOT call `successResponse` / `errorResponse` — that's the route's job.
- Does NOT throw HTTP-shaped errors — it throws `ServiceError` with a code, and the route maps to a status.

The route becomes:
```ts
export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: recordPaymentSchema,
  handler: async (ctx, body) => {
    const result = await recordPayment({ ctx, input: body });
    return respond.status(201, toFeePaymentDTO(result.payment));
  },
});
```

Tests in `lib/services/<domain>/*.test.ts` use a mocked Supabase and assert on:
- Happy path: the right tables are written, in the right order.
- Each error path: `feeAccount` missing → `ServiceError("fee_account_not_found", 400)`, etc.
- Side effects: audit log row written with the right shape, push notification enqueued (or sent, depending on policy), cache invalidated.

**PR plan (split by domain):**
- PR-D1: extract `fees/*` services + tests.
- PR-D2: extract `academics/*` services + tests.
- PR-D3: extract `attendance/*` services + tests.
- PR-D4: extract `communication/*` services + tests (this is where the SMS outbox lands).
- PR-D5: extract the remaining domains.

**Acceptance:** `npx vitest run lib/services` shows ≥80% line coverage on each service file. Each route handler is ≤50 lines.

### 5.5 DTO layer (P8)

**Why now.** Pages hand-unwrap `Array.isArray(x) ? x[0] : x` for every join. The type system is compensating for a missing DTO.

**The change.** For each domain, create `types/dto/<domain>.ts` with:
- The DTO type (camelCase, no `snake_case` leaks).
- The `toXxxDTO(row)` mapper.

The API returns DTOs. The page consumes DTOs. PostgREST's `*` selections in the API are replaced with explicit column lists. The page never sees the raw row.

**PR plan:**
- PR-E1: `types/dto/fees.ts` + DTOs for `FeePayment`, `FeeAccount`, `FeeStructure`. API emits them, page consumes them. Delete the local `PaymentRow` interface in `app/dashboard/fees/payments/page.tsx`.
- PR-E2: DTOs for `students`, `staff`, `academics`.
- PR-E3: DTOs for the remaining domains.

**Acceptance:** `grep -rn "Array.isArray" app/dashboard` returns zero results. Every page imports from `@/types/dto/...`.

### 5.6 Page data layer (P4 completion)

**Why now.** Some pages still call `supabase.from` directly. The ESLint rule from PR 1 should already be flagging this, but the migration to fetch-through-API needs the right hook helpers.

**The change.** One hook per read endpoint, in `lib/hooks/<domain>.ts`. Use `fetchPaginated<DTO>` from `lib/api-fetch`. Use `queryKeys.<domain>(schoolId, ...)` from `lib/query-keys`. Use the centralised `invalidate.<domain>Changed(qc, schoolId)` helper.

The hook for `/api/fees/payments` is in the migration guide §4.6. Apply that pattern to every read endpoint.

**PR plan:** do this alongside the route refactor (one read at a time, in the same PR that refactors the route). When the route returns a DTO, the page hook consumes it. The page is now a pure render component.

---

## 6 · Observability (P9 completion)

Three things the audit was missing.

### 6.1 Structured request logging

The Sentry capture is per-error. We also need per-request logs. Add a `lib/log.ts` (pino is already a dep) and wrap the `route()` implementation to emit one log line per request with `route`, `method`, `school_id`, `user_id`, `status`, `duration_ms`, and `cache_status` (from the `x-skuli-cache` header). Tag these as `info` so they don't pollute Sentry. The pattern: emit on the way out, inside the `try { ... } catch { return handleRouteError(...); }` block.

### 6.2 Cache effectiveness dashboard

The `x-skuli-cache: hit|miss|stale-revalidate` header is already set. We need to chart it. Add a Vercel Analytics or PostHog event per request that fires the header. The dashboard team can chart hit rate by route.

### 6.3 Webhook delivery dashboard

The webhook handlers (PR 9) should also emit one log line per delivery: `route`, `order_tracking_id`, `verified_status`, `processed_branch` (`tuition_payment` | `payroll_funding` | `subscription` | `no_match`). Sentry breadcrumbs around the IPN verification failure case. This is how you catch a payment-gateway outage early.

---

## 7 · Security Gates (P9 completion)

### 7.1 ESLint rules (PR 1 + this section)

The PR 1 rule bans direct `@supabase/supabase-js` in `app/api/`. Add:

- `app/api/**` may not import `next/server` directly except for `NextRequest` (the type). It must go through `@/lib/http`.
- `app/api/**` may not call `cookies()` directly. Auth context is the only way to get the Supabase client.
- `app/api/**` may not call `Response.json` directly with a non-envelope shape. The only exception is webhooks under `publicRoute`.
- `app/**/page.tsx` and `app/**/layout.tsx` may not import `@/lib/supabase/admin` (the service-role client). Pages use the browser client or fetch through `/api`.

### 7.2 Rate limiting on the heavy routes

`checkRateLimitAsync` is already in `lib/utils/rate-limit.ts`. Add it to:
- `/api/communication/send` (per school, 10/minute).
- `/api/auth/callback` (per IP, 30/minute).
- `/api/billing/initiate` (per school, 30/minute).
- `/api/students/bulk-import` (per school, 5/minute — this writes a lot of rows).
- `/api/payments/stk-push` (per school, 20/minute).

The 429 response should use the `errorResponse` envelope: `{ success: false, error: "Rate limit exceeded", retry_after: <seconds> }`.

### 7.3 CSP tightening

The current `next.config.ts` has `script-src 'self' 'unsafe-inline' ... 'unsafe-eval'` in dev only. Audit the production CSP. `'unsafe-inline'` for scripts is the real risk — Next.js needs it for the inline boot script. Once we move to Next.js's nonce support (16+), the `'unsafe-inline'` can be replaced with a per-request nonce. Track that as a follow-up.

### 7.4 Secret rotation

The `.env.local` is real and present. Add a `scripts/check-secrets.mjs` that asserts each required env var is set, the Sentry DSN is not the example value, and the Supabase service role key has not been committed to git history (`git log -p -- .env*` should be empty). This runs in CI.

---

## 8 · Tests (P9 completion)

The test suite today covers six files in `lib/`. The migration is incomplete without:

### 8.1 Service-layer unit tests (PR-D1 through D5)

For each `lib/services/<domain>/*.ts`, a sibling `*.test.ts` with:
- Happy path with a mocked Supabase.
- Each error path produces the right `ServiceError`.
- Side effects: audit log row, push notification, cache invalidation.
- ≥80% line coverage per file.

### 8.2 Route integration tests

`app/api/<domain>/__tests__/<route>.test.ts` that exercises the wrapped route through `routeTest({ roles, schema, handler })` — a vitest helper that mocks `getSupabaseAndUser`, calls the handler with a fake `NextRequest`, and asserts on the response shape. The wrapper's contract is what we're testing, not the DB.

### 8.3 Smoke test harness

A `tests/smoke.spec.ts` that uses Playwright (already a possible dep — confirm with the team) to:
- Log in as a SUPER_ADMIN. Visit `/admin`. Visit `/admin/schools`. Visit `/admin/revenue`. No console errors.
- Log in as a SCHOOL_ADMIN. Visit `/dashboard`. Visit `/dashboard/fees/payments`. Record a payment. See the receipt. No console errors.
- Log in as a BURSAR. Visit `/dashboard/fees`. Visit `/dashboard/fees/expenses`. Add an expense. No console errors.
- Log in as a TEACHER. Visit `/teacher`. Visit `/teacher/marks`. Enter a mark. No console errors.
- Log in as a PARENT. Visit `/portal`. Visit `/portal/fees`. No console errors.
- Log in as a GROUP_ADMIN. Visit `/group`. Visit `/group/analytics`. No console errors.

This is the regression test for the whole refactor.

---

## 9 · Documentation (the part nobody wants to do but everyone needs)

### 9.1 Update the README

The `README.md` describes the stack and the user roles. Add a "Architecture" section that links to:
- The architecture review (the audit).
- The migration guide.
- The DTO layer (after PR-E1).
- The service layer (after PR-D1).

### 9.2 Add an `ARCHITECTURE.md` at the repo root

A single-page map: what is in `app/`, what is in `lib/`, what is in `store/`, what is in `supabase/`, how a request flows from the page through the API to the DB, how the cache works, how the audit log works, how the SMS dispatch works. New engineers should be able to read this one file and orient themselves.

### 9.3 Add a `CONTRIBUTING.md`

- Branch naming: `feat/<scope>-<short-desc>`, `fix/<scope>-<short-desc>`, `chore/<scope>-<short-desc>`.
- Commit message format: conventional commits.
- PR template: what to test, what to screenshot, what to flag for review.
- The CI gate: typecheck, lint, test, build must all pass.
- The "no direct Supabase in pages" rule, explained with a one-line example.

---

## 10 · Acceptance Criteria (the whole refactor is done when…)

### 10.1 Functional

- [ ] All 111 routes use the `route()` or `publicRoute()` wrapper.
- [ ] All routes that POST/PATCH/DELETE with a body declare a Zod schema.
- [ ] All routes that need RBAC declare a non-empty `roles` array.
- [ ] The 4 webhooks are `publicRoute`.
- [ ] No `as unknown as Database["…"]` cast in `app/api/`.
- [ ] No `err.message → errorResponse` pattern in `app/api/`.
- [ ] No `console.error` in `app/api/` (Sentry wrapper instead, where the migration guide's `// route()-wrapped` comment used to live).
- [ ] No direct `supabase.from(...)` in `app/**/page.tsx` or `app/**/layout.tsx` (ESLint-enforced).
- [ ] `store/school.ts` has no `term` / `academicYear` aliases.
- [ ] `/api/v1/*` is gone; one canonical `/api/*` per resource.
- [ ] The SMS outbox is live; the per-recipient loop in `/api/communication/send` is gone.
- [ ] The tag-based cache is live on every read endpoint; mutations invalidate by tag.
- [ ] DTOs exist for `fees`, `students`, `staff`, `academics`, `attendance`, `communication`, `library`, `assets`.
- [ ] Service layer exists for every domain; every route handler is ≤50 lines.

### 10.2 Quality

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx eslint .` exits 0.
- [ ] `npx vitest run` is green; ≥80% line coverage on `lib/services/`.
- [ ] `npm run build` succeeds.
- [ ] The smoke test (PR per §8.3) passes on all six roles.
- [ ] No `// TODO` left in production code.
- [ ] No file under `app/api/` exceeds 80 lines (the handler logic moved to services).

### 10.3 Observability

- [ ] Every request emits one structured log line with `route`, `method`, `school_id`, `user_id`, `status`, `duration_ms`, `cache_status`.
- [ ] Every webhook delivery emits one log line with `route`, `order_tracking_id`, `verified_status`, `processed_branch`.
- [ ] The `x-skuli-cache` hit rate is visible in the analytics dashboard.
- [ ] Sentry is wired into every error path; no `try { } catch { /* swallow */ }` blocks an unhandled error from reaching Sentry.

### 10.4 Security

- [ ] The four ESLint rules from §7.1 are in place and CI-enforced.
- [ ] The rate limit list from §7.2 is live.
- [ ] The CSP audit has been run; the only remaining `unsafe-inline` is the Next.js boot script.
- [ ] The secret-rotation script from §7.4 runs in CI.

### 10.5 Documentation

- [ ] `README.md` updated.
- [ ] `ARCHITECTURE.md` exists at the repo root.
- [ ] `CONTRIBUTING.md` exists.
- [ ] The migration guide (`docs/ROUTE_REFACTOR_MIGRATION.md`) is kept in sync with the actual state of the code.

---

## 11 · How to use this prompt

Paste the entire file (this file) into a fresh Claude Code / Cursor / senior-engineer session, with the architecture review and the migration guide in the same context. Tell the model:

> You are a senior engineer joining this codebase. Read the architecture review at `<path>`, the migration guide at `docs/ROUTE_REFACTOR_MIGRATION.md`, and this prompt in full. Then execute PR 1 from the migration guide and §4 of this prompt. Do not start a second PR until the first is merged or explicitly told to continue. After each PR, summarise the diff in 5 lines and stop.

If the model starts to drift (refactors more than the PR scope, introduces a new pattern, breaks a test), stop it and re-paste this prompt. The PR plan is the contract; one PR at a time.

If the model hits a real ambiguity (a route whose semantics you have not documented, a schema that's clearly wrong, a security gate that needs a human decision), it should stop and ask. Do not let it guess.

---

## 12 · The one-line summary

**Apply the foundation that's already in the repo. Extract business logic into services. Standardise the API surface, the page data layer, the cache, the SMS dispatch, the store, and the tests. Add the missing observability and security gates. Land it in 10 small, reviewable, behaviour-preserving PRs.**
