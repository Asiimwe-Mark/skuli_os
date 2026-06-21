# SKULI OS — Route Refactor Migration Guide

This guide walks a developer through converting every `app/api/**/route.ts` to the
new `route({ roles, schema, handler })` wrapper. The review that motivated this
work is in the team wiki; this document is only the *execution* plan.

---

## 1. Goals

- **Single import surface for routes.** Every route imports from `@/lib/http`.
- **Auth + RBAC is not opt-in.** `route({ roles: [...], handler })` is the contract.
- **Zod validation is the second argument, not something a route forgets to do.**
- **Errors never leak.** `handleRouteError` is the only catch path.
- **No functional change.** Wire format, DB calls, status codes, audit log entries, cache behaviour — all preserved.

## 2. Files to add

| Path | Purpose |
|---|---|
| `lib/http/route.ts` | `route()`, `publicRoute()`, `respond` |
| `lib/http/respond.ts` | Re-exports of `successResponse`, `errorResponse`, `paginatedResponse` |
| `lib/http/with-cache.ts` | `withSchoolReadCache` — wraps `withSchoolCache` + sets `x-skuli-cache` header |
| `lib/http/index.ts` | Barrel |

The wrapper code is in the architecture review. It is correct, but the *TypeScript
overloads on `route()`* are the only part that needs care: the implementation body
must be a single function signature, and the two public signatures are overloads
above it. Get the brace count right by adding the two `export function route(...)`
overloads **above** the implementation `export function route(opts: ...)`.

The implementation function signature should be:

```ts
export function route(
  opts: {
    roles: readonly Role[];
    noSchoolRequired?: boolean;
    schema?: ZodTypeAny;
    handler: (ctx: AuthContext, ...rest: unknown[]) => Promise<unknown>;
  }
) { ... }
```

…not the conditional-generic form. The conditional form loses narrowing and every
caller will need explicit type arguments. The overload form does not.

## 3. Per-route pattern

### 3.1 GET, no body, no schema

```ts
// before
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    // ... read ...
    return successResponse(data);
  } catch (err) {
    return handleRouteError(err, "GET /api/...");
  }
}

// after
export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],   // empty array = any signed-in user
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;   // wrapper guarantees this for non-SUPER_ADMIN
    // ... read ...
    return data;
  },
});
```

### 3.2 GET with cache

The `successResponse(value) + setCacheHeader(response, hit)` pair becomes:

```ts
const { value, applyTo } = await withSchoolReadCache(
  { schoolId, inputShape: `students:${page}:${limit}` },
  async () => loadStudents(...)
);
return respond.cacheable(value);
```

`respond.cacheable` produces the right `Cache-Control` header AND sets
`x-skuli-cache: hit|miss` through the wrapper. Hand-rolled `setCacheHeader` calls
disappear.

### 3.3 POST with schema

```ts
// before
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);
    const body = await request.json();
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);
    // ... write ...
    return successResponse(payment, 201);
  } catch (err) {
    return handleRouteError(err, "POST /api/...");
  }
}

// after
export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: recordPaymentSchema,
  handler: async (ctx, body) => {
    // body is already parsed + typed
    // ... write ...
    return respond.status(201, payment);
  },
});
```

### 3.4 PATCH / DELETE

Same as POST. If the body needs a partial schema, use `schema.partial()` at the
schema-export site, not at the route — keeps route files uniform.

### 3.5 Webhooks (`/api/webhooks/*`)

Webhooks do not authenticate via Supabase. They carry their own HMAC and return
a non-standard envelope. Use `publicRoute()`:

```ts
export const POST = publicRoute(async (request) => {
  // 1. verify HMAC
  // 2. parse body
  // 3. do the work via createAdminClient()
  // 4. return Response.json({ status: "ok" })
});
```

`publicRoute` still routes unhandled exceptions through `handleRouteError`, so
an uncaught throw returns a clean 500 — it just doesn't add the `{ success, data }`
envelope.

### 3.6 `request` is always the third argument

`route()` infers from `schema` whether the second argument is `body` or
`request`. When there is no schema, the handler is `(ctx, request)`. When there
is a schema, the handler is `(ctx, body, request)`. **Do not** name the
non-body argument `request` and shadow it — TypeScript will treat it as
`NextRequest` (correct) and any direct read of `request.json()` is unnecessary
because the wrapper has already done it.

## 4. Files to touch (111 total)

| Domain | Count | Notes |
|---|---|---|
| `academic-years` | 1 | batch 1 |
| `academics/marks` | 1 | schema: `submitMarksSchema` |
| `academics/report-cards/generate` | 1 | schema in `lib/validations/report-cards.ts` |
| `academics/report-cards/publish` | 1 | schema in `lib/validations/report-cards.ts` |
| `admin/concierge` | 1 | `noSchoolRequired: true` |
| `admin/concierge/[id]` | 1 | `noSchoolRequired: true` |
| `admin/countries` | 1 | `noSchoolRequired: true` |
| `admin/impersonate` | 1 | `noSchoolRequired: true` |
| `admin/impersonate/exit` | 1 | `noSchoolRequired: true` |
| `admin/marketplace` | 1 | `noSchoolRequired: true` |
| `admin/platform-settings` | 1 | `noSchoolRequired: true` |
| `admin/referrals` | 1 | `noSchoolRequired: true` |
| `admin/revenue` | 1 | `noSchoolRequired: true` |
| `admin/schools` | 1 | `noSchoolRequired: true` |
| `africas-talking/test` | 1 | `publicRoute` (no Supabase auth) |
| `analytics/custom-report` | 1 | POST body for filters |
| `analytics/custom-report-pdf` | 1 | POST body for filters |
| `analytics/emis/data` | 1 | simple GET |
| `analytics/emis/pdf` | 1 | POST body for filters |
| `analytics/emis/xlsx` | 1 | POST body for filters |
| `assets` | 1 | schema in `lib/validations/assets.ts` |
| `assets/maintenance` | 1 | schema in `lib/validations/assets.ts` |
| `attendance` | 1 | schema: `takeAttendanceSchema` |
| `attendance/certificate-pdf` | 1 | simple GET, no auth (signed URL only) |
| `attendance/class-list` | 1 | simple GET |
| `attendance/register-pdf` | 1 | simple GET |
| `auth/callback` | 1 | `publicRoute` (OAuth code exchange) |
| `billing/initiate` | 1 | schema in `lib/validations/billing.ts` |
| `calendar` | 1 | schema in `lib/validations/calendar.ts` |
| `classes` | 1 | simple GET |
| `communication/reply` | 1 | schema in `lib/validations/communication.ts` |
| `communication/send` | 1 | schema: `sendSmsSchema` |
| `communication/sms-balance` | 1 | simple GET |
| `communication/threads` | 1 | simple GET |
| `communication/threads/[id]` | 1 | PATCH (mark read) |
| `communication/threads/[id]/messages` | 1 | simple GET |
| `concierge/request` | 1 | schema: `conciergeRequestSchema` (PUBLIC — use `publicRoute`) |
| `discipline` | 1 | schema in `lib/validations/discipline.ts` |
| `discipline/notify-parent` | 1 | schema in `lib/validations/discipline.ts` |
| `fees/accounts` | 1 | PATCH (no schema — body is `{ id, total_expected, ... }`) |
| `fees/accounts/search` | 1 | simple GET |
| `fees/discounts` | 1 | schema in `lib/validations/fees.ts` |
| `fees/expenses` | 1 | schema: `createExpenseSchema` |
| `fees/expenses/categories` | 1 | simple body, no Zod |
| `fees/expenses/export` | 1 | simple GET |
| `fees/generate-accounts` | 1 | schema: `generateFeeAccountsSchema` |
| `fees/payments` | 1 | schema: `recordPaymentSchema` |
| `fees/pl-report` | 1 | simple GET |
| `fees/receipt-pdf/[payment_id]` | 1 | simple GET |
| `fees/statements` | 1 | schema: `feeStatementSchema` |
| `fees/stk-push` | 1 | schema in `lib/validations/fees.ts` |
| `fees/structure` | 1 | schema: `createFeeStructureSchema` |
| `fees/structure/[id]` | 1 | PATCH + DELETE |
| `fees/student-discounts` | 1 | schema: `applyDiscountSchema` |
| `group/analytics` | 1 | `noSchoolRequired: true` |
| `group/schools` | 1 | `noSchoolRequired: true` |
| `library/books` | 1 | schema in `lib/validations/library.ts` |
| `library/issues` | 1 | schema in `lib/validations/library.ts` |
| `library/issues/export` | 1 | simple GET |
| `marketplace` | 1 | simple GET |
| `marketplace/[id]/import` | 1 | schema in `lib/validations/marketplace.ts` |
| `meetings/bookings` | 1 | simple GET |
| `meetings/bookings/[id]` | 1 | PATCH (no schema) |
| `meetings/slots` | 1 | schema in `lib/validations/meetings.ts` |
| `meetings/slots/[id]` | 1 | PATCH (no schema) |
| `onboard` | 1 | `publicRoute` (sign-up) |
| `payments/stk-push` | 1 | schema in `lib/validations/fees.ts` |
| `pdf/calendar` | 1 | simple GET, returns PDF blob |
| `pdf/timetable` | 1 | simple GET, returns PDF blob |
| `portal/attendance` | 1 | simple GET |
| `portal/meetings` | 1 | simple GET |
| `portal/meetings/book` | 1 | schema in `lib/validations/meetings.ts` |
| `portal/meetings/slots` | 1 | simple GET |
| `portal/meetings/teachers` | 1 | simple GET |
| `portal/meetings/[id]` | 1 | PATCH (no schema) |
| `portal/messages` | 1 | simple GET |
| `portal/notifications` | 1 | PATCH (no schema) |
| `portal/report-card-pdf` | 1 | simple GET |
| `portal/students` | 1 | simple GET |
| `push/process-queue` | 1 | worker — special, keep raw handler (no auth) |
| `push/send` | 1 | schema in `lib/validations/push.ts` |
| `push/subscribe` | 1 | schema in `lib/validations/push.ts` |
| `push/unsubscribe` | 1 | simple body, no Zod |
| `referral/apply` | 1 | `publicRoute` (sign-up) |
| `referral/code` | 1 | `publicRoute` (sign-up link lookup) |
| `referral/validate` | 1 | `publicRoute` (sign-up link lookup) |
| `reports/discipline-summary` | 1 | POST body for filters |
| `settings/api` | 1 | schema in `lib/validations/settings.ts` |
| `settings/pesapal` | 1 | schema in `lib/validations/settings.ts` |
| `settings/pesapal/test` | 1 | simple GET |
| `staff` | 1 | schema in `lib/validations/staff.ts` |
| `staff/[id]` | 1 | PATCH + DELETE (no schema) |
| `staff/payroll/run` | 1 | schema in `lib/validations/staff.ts` |
| `students` | 1 | schema: `createStudentSchema` |
| `students/[id]` | 1 | PATCH + DELETE (no schema) |
| `students/alumni` | 1 | schema in `lib/validations/student.ts` |
| `students/bulk-import` | 1 | schema in `lib/validations/bulk-import.ts` |
| `students/bulk-import/preview` | 1 | schema in `lib/validations/bulk-import.ts` |
| `teacher/assignments` | 1 | schema in `lib/validations/teacher.ts` |
| `terms` | 1 | simple GET |
| `timetable/periods` | 1 | schema in `lib/validations/timetable.ts` |
| `timetable/slots` | 1 | schema in `lib/validations/timetable.ts` |
| `users/invite` | 1 | schema in `lib/validations/auth.ts` |
| `v1/fee-types` | 1 | schema in `lib/validations/fees.ts` |
| `v1/payments/initiate` | 1 | schema in `lib/validations/fees.ts` |
| `v1/payments/status` | 1 | simple GET |
| `v1/payroll/approve` | 1 | schema in `lib/validations/staff.ts` |
| `v1/staff/[id]/payment-profile` | 1 | PATCH (no schema) |
| `webhooks/africas-talking/mm` | 1 | `publicRoute` |
| `webhooks/africas-talking/sms` | 1 | `publicRoute` |
| `webhooks/pesapal` | 1 | `publicRoute` |

**Total: 111 routes.**

## 5. Per-batch typecheck gate

After each batch:

```bash
npx tsc --noEmit 2>&1 | tee /tmp/tsc-batch-N.log
```

A clean batch has zero new errors. Pre-existing errors (from the current tree
where 45 routes import `getErrorStatus` that is exported) are out of scope for
this refactor — fix them in a separate PR.

## 6. Per-batch test gate

```bash
npx vitest run 2>&1 | tee /tmp/vitest-batch-N.log
```

`lib/api-helpers.test.ts` already covers the wrapper's contract. New
behaviour-specific tests belong in `app/api/<domain>/__tests__/`.

## 7. Edge cases

### 7.1 `successResponse(payment, 201)`

The wrapper builds the envelope itself. Replace with `return respond.status(201, payment)`.

### 7.2 Raw `Response.json(...)` for non-standard envelopes

Webhooks. Use `publicRoute` and keep the raw `Response.json(...)` inside.

### 7.3 PDF routes

`/api/pdf/*` return `Response` with a binary body. The wrapper builds a JSON
envelope which is **wrong** for these. Two options:

- (a) Have the PDF route write to a Supabase Storage bucket and return a
  `{ url, expires_at }` JSON envelope, redirect the page to that URL.
- (b) Use `publicRoute` and return the binary `Response` directly.

Option (a) is the right long-term fix; (b) is the minimal change for this refactor.

### 7.4 `push/process-queue`

Worker route, no auth (called by cron). Use `publicRoute` and keep the existing
`{ success, processed }` envelope. **Do not** apply the auth-checking `route()`
wrapper — it would reject the unauthenticated cron call.

### 7.5 Routes that read `request.json()` outside the schema (rare)

The wrapper always parses the body when `schema` is set. If a route needs both
a schema-validated subset AND the raw body, move the raw body to a query param
or refactor to PATCH with the schema. There are no routes in the current tree
that need this — flagged for review if it ever shows up.

### 7.6 `as unknown as Database["…"]` casts

Out of scope for this refactor. These should be replaced with `z.infer<>`-derived
types in a follow-up. Leave them in place; the wrapper does not care.

### 7.7 The `catches` that swallow errors silently

The current tree has 40 `console.error` calls. Some of them are intentional
("push failure should not block attendance recording" — `app/api/attendance/route.ts:197`).
Keep those inside the handler, **do not** delete them. The wrapper only catches
errors that escape the handler; the inline `try { ... } catch { /* swallow */ }`
that protects a non-critical side-effect (push, SMS, audit) stays exactly as it is.

## 8. Suggested PR breakdown

| PR | Scope | Est. LoC touched |
|---|---|---|
| 1 | Add `lib/http/` scaffolding + the ESLint rule (no route changes) | +250, -0 |
| 2 | Refactor `academic-years`, `terms`, `classes`, `calendar` (5 routes) | +30, -120 |
| 3 | Refactor remaining batch-1 read-only routes (~20 routes) | +100, -500 |
| 4 | Refactor batch-2 read-with-body routes (5 routes) | +30, -120 |
| 5 | Refactor `fees/*` and `students/*` (~12 routes) | +150, -600 |
| 6 | Refactor `staff/*`, `academics/*`, `attendance/*`, `library/*`, `assets/*` (~15 routes) | +200, -800 |
| 7 | Refactor `admin/*`, `group/*`, `v1/*` (~17 routes) | +200, -900 |
| 8 | Refactor `communication/*`, `meeting/*`, `portal/*`, `teacher/*`, `timetable/*`, `concierge/*`, `marketplace/*`, `referral/*`, `discipline/*`, `settings/*`, `reports/*`, `payments/*`, `fees/stk-push`, `fees/payments` POST, `onboard`, `billing/*`, `users/*`, `auth/callback`, `push/*` (~30 routes) | +400, -1500 |
| 9 | Refactor webhooks to `publicRoute` (4 routes) | +50, -300 |
| 10 | Final: ESLint rule enforcement on, run full test suite, update README | +50, -50 |

Each PR is independently mergeable. Each ends with `tsc --noEmit` clean and
`vitest` green. No PR changes the wire format, the DB schema, or any user-visible
behaviour.

## 9. Acceptance criteria for the migration to be considered done

- [ ] `lib/http/` exists and is the only new module.
- [ ] All 111 `app/api/**/route.ts` files import from `@/lib/http`.
- [ ] `grep -r "getErrorStatus(err)" app/api` returns zero results.
- [ ] `grep -r "errorResponse(err" app/api` returns zero results (the bare `errorResponse(msg, status)` calls remain — those are intentional 4xx returns inside the handler).
- [ ] `grep -rn "from \"@supabase/supabase-js\"" app/api` returns zero results.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx vitest run` is green.
- [ ] `npm run build` succeeds.
- [ ] Smoke test: log in as a SUPER_ADMIN, SCHOOL_ADMIN, BURSAR, TEACHER, PARENT in turn and verify each section loads. Five manual clicks, no API changes observed.

## 10. What this refactor is *not*

- It is not a service-layer extraction. Business logic stays in the route
  handlers. That is a separate refactor (see the architecture review, Strategy A
  follow-ups).
- It is not a DTO layer introduction. Pages still consume the raw PostgREST
  shape. That is a separate refactor (Strategy D).
- It is not a tag-based cache. `withSchoolReadCache` wraps the existing
  `withSchoolCache` unchanged. That is a separate refactor (Strategy B).
- It is not an SMS outbox. The `for (const recipient of recipients)` loop in
  `app/api/communication/send/route.ts` stays exactly as it is. That is a
  separate refactor (Strategy E).

Each of those is a real follow-up. None of them block this one.
