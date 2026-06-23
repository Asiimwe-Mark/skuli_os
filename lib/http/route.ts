/**
 * `route()` — the one wrapper for every authenticated API route.
 *
 * The whole point
 * ---------------
 * 78 of 111 routes previously hand-rolled the same five-line dance:
 *
 *     const ctx = await getSupabaseAndUser();
 *     const schoolId = requireSchool(ctx);
 *     requireRole(ctx, [...]);
 *     const body = await request.json();
 *     const parsed = schema.safeParse(body);
 *     if (!parsed.success) return errorResponse(...);
 *     // ... business logic ...
 *     return successResponse(data);
 * } catch (err) { return errorResponse(err.message, getErrorStatus(err)); }
 *
 * Drift in that dance (forgetting the role check, leaking the raw
 * `err.message` to the client, returning the wrong status) is exactly
 * what audit P1 / P2 flagged. This wrapper is the contract:
 *
 *     export const GET = route({
 *       roles: ["SCHOOL_ADMIN", "BURSAR"],
 *       handler: async (ctx, request) => { ... return data; }
 *     });
 *
 *     export const POST = route({
 *       roles: ["SCHOOL_ADMIN"],
 *       schema: recordPaymentSchema,
 *       handler: async (ctx, body) => { ... return respond.status(201, x); },
 *     });
 *
 * Auth + RBAC + body validation + error envelope are not opt-in anymore.
 *
 * TypeScript shape — read carefully
 * ---------------------------------
 * The two public signatures below are OVERLOADS. They give callers
 * (a) typed body when `schema` is provided, (b) `request` directly
 * when `schema` is omitted. They MUST sit above the implementation
 * `export function route(opts: RouteImplOpts)` further down — that
 * implementation has the lossy `unknown` rest signature and is not
 * visible to callers.
 *
 * The implementation's signature deliberately is NOT the conditional
 * generic form (`S extends ZodTypeAny ? ... : ...`). That form loses
 * narrowing and forces every caller to provide an explicit type
 * argument. The overload form does not.
 *
 * `publicRoute` is the same idea but with no Supabase auth — for
 * webhooks, OAuth callbacks, and the SMS outbox worker.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ZodTypeAny } from "zod";
import {
  AuthError,
  getSupabaseAndUser,
  handleRouteError,
} from "@/lib/api-helpers";
import type { AuthContext as BaseAuthContext } from "@/lib/api-helpers";

/**
 * The route handler context.
 *
 * Adds a typed, non-null `schoolId` on top of the base `AuthContext`
 * so handlers stop writing `const schoolId = ctx.profile.school_id!`
 * at the top of every file. The wrapper guarantees:
 *
 *   • non-SUPER_ADMIN: schoolId === profile.school_id (non-null,
 *     the wrapper already 400'd before the handler runs).
 *   • SUPER_ADMIN:    schoolId === "__super_admin__" sentinel;
 *     cross-tenant handlers MUST override by reading `?school_id=`
 *     and using `crossTenantQuery(ctx, table, schoolId)`.
 */
export interface AuthContext extends BaseAuthContext {
  readonly schoolId: string;
}

/**
 * Sentinel schoolId for SUPER_ADMIN handlers that intentionally
 * cross tenant boundaries. Handlers must NOT use `ctx.schoolId`
 * when this is the value; they must read the explicit schoolId
 * from the request body or query string.
 */
export const SUPER_ADMIN_SENTINEL = "__super_admin__";

// ─── Role definition ─────────────────────────────────────────────────────────

export type Role =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "BURSAR"
  | "TEACHER"
  | "PARENT"
  | "GROUP_ADMIN";

// ─── `route()` overloads (callers see these two only) ────────────────────────

interface RouteOptsWithSchema<S extends ZodTypeAny, R> {
  roles: readonly Role[];
  schema: S;
  noSchoolRequired?: boolean;
  handler: (ctx: AuthContext, body: S["_output"], request: NextRequest, params?: Record<string, string>) => Promise<R>;
}

interface RouteOptsWithoutSchema<R> {
  roles: readonly Role[];
  schema?: undefined;
  noSchoolRequired?: boolean;
  handler: (ctx: AuthContext, request: NextRequest, params?: Record<string, string>) => Promise<R>;
}

/** Handler with a Zod schema: second argument is the parsed + typed body. */
export function route<S extends ZodTypeAny, R>(
  opts: RouteOptsWithSchema<S, R>,
): (req: NextRequest) => Promise<NextResponse>;

/** Handler without a schema: second argument is the raw NextRequest. */
export function route<R>(
  opts: RouteOptsWithoutSchema<R>,
): (req: NextRequest) => Promise<NextResponse>;

// ─── Implementation (callers never see this signature) ──────────────────────

/**
 * The single, lossy implementation signature. The two overloads above
 * are what callers see and what gives them typed `body` when `schema`
 * is provided. Inside the body we cast `opts.handler as ...` to call
 * the right shape.
 *
 * The `...rest: any[]` is deliberate: the overloads handle the type
 * narrowing; this implementation is the shared inner function. ESLint
 * flags `any` by default but the comment above documents the intent.
 */
export function route(opts: {
  roles: readonly Role[];
  schema?: ZodTypeAny;
  noSchoolRequired?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: AuthContext, ...rest: any[]) => Promise<unknown>;
}): (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (
    req: NextRequest,
    routeCtx?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const baseCtx = await getSupabaseAndUser();
      // School-scoped roles must belong to a school. SUPER_ADMIN is the
      // only platform role that crosses schools (audit §1.2 topology).
      // noSchoolRequired is for endpoints like /api/admin/* that
      // intentionally don't need one for callers of any role.
      const requiresSchool =
        !opts.noSchoolRequired && baseCtx.profile.role !== "SUPER_ADMIN";
      if (requiresSchool && !baseCtx.profile.school_id) {
        throw new AuthError("No school associated with this account", 400);
      }
      if (opts.roles.length > 0 && !opts.roles.includes(baseCtx.profile.role as Role)) {
        throw new AuthError("Insufficient permissions", 403);
      }
      // Augment the base context with a typed `schoolId`. For
      // non-SUPER_ADMIN this is the user's school; for SUPER_ADMIN
      // it is the sentinel that signals "you must read an explicit
      // schoolId from the request". Either way the handler sees a
      // non-null string, so the `!` assertion in `ctx.profile.school_id!`
      // disappears for good.
      const ctx: AuthContext = {
        ...baseCtx,
        schoolId: baseCtx.profile.school_id ?? SUPER_ADMIN_SENTINEL,
      };
      // Dynamic-route params (e.g. `[id]`, `[payment_id]`) resolved
      // lazily by Next.js. We await them once here so handlers don't
      // have to. Handlers receive the resolved record as the fourth
      // argument; if there are no dynamic segments it is `undefined`.
      const params = routeCtx?.params
        ? ((await routeCtx.params) as Record<string, string>)
        : undefined;
      if (opts.schema) {
        const raw = await req.json().catch(() => ({}));
        const parsed = opts.schema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            {
              success: false,
              error: parsed.error.issues[0]?.message ?? "Invalid request",
            },
            { status: 400 },
          );
        }
        const data = await (
          opts.handler as (
            ctx: AuthContext,
            body: unknown,
            req: NextRequest,
            params?: Record<string, string>,
          ) => Promise<unknown>
        )(ctx, parsed.data, req, params);
        // Handlers may return either a plain value (the wrapper wraps
        // it in `{ success, data }`) or a pre-built Response (the
        // handler chose to control the wire format itself, e.g.
        // `respond.cacheable(value)` for a cacheable read). Pass the
        // Response through unchanged.
        if (data instanceof Response) {
          return data as NextResponse;
        }
        return NextResponse.json(
          { success: true, data },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
      const data = await (
        opts.handler as (
          ctx: AuthContext,
          req: NextRequest,
          params?: Record<string, string>,
        ) => Promise<unknown>
      )(ctx, req, params);
      // Same Response-vs-value contract as the schema branch above.
      if (data instanceof Response) {
        return data as NextResponse;
      }
      return NextResponse.json(
        { success: true, data },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch (err) {
      // Surface server-side AuthError messages directly to the client
      // (e.g. "School not found", "Forbidden"). For all other errors we
      // hand off to handleRouteError, which redacts the message.
      if (err instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status },
        );
      }
      return handleRouteError(err, req.nextUrl.pathname) as NextResponse;
    }
  };
}

// ─── `publicRoute()` — no Supabase auth, still routes through handleRouteError

/**
 * For routes that do NOT authenticate through Supabase:
 *
 *   - OAuth callbacks  (/api/auth/callback)
 *   - Webhooks         (/api/webhooks/*)  — verify HMAC inside
 *   - Public sign-ups  (/api/onboard, /api/referral/*)
 *   - Public requests  (/api/concierge/request)
 *   - Worker endpoints (/api/push/process-queue)
 *
 * Errors still funnel through `handleRouteError` (a clean 500), but
 * the `{ success, data }` envelope is NOT applied — these endpoints
 * return their own shape (webhook acknowledgement, redirect, etc.).
 */
export function publicRoute(
  handler: (request: NextRequest) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status },
        );
      }
      return handleRouteError(err, req.nextUrl.pathname);
    }
  };
}
