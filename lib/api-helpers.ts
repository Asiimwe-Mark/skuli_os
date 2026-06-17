import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { captureException } from "@/lib/error-report";

export interface AuthContext {
  supabase: SupabaseClient<Database>;
  user: User;
  profile: {
    id: string;
    school_id: string | null;
    role: string;
    full_name: string;
  };
}

/**
 * Creates a Supabase server client from cookies, validates the session,
 * and returns the authenticated user + profile.
 */
export async function getSupabaseAndUser(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, school_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    throw new AuthError("User profile not found", 404);
  }

  return {
    supabase: supabase as SupabaseClient<Database>,
    user,
    profile: profile as AuthContext["profile"],
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Check that the user belongs to a school. */
export function requireSchool(ctx: AuthContext): string {
  if (!ctx.profile.school_id) {
    throw new AuthError("No school associated with this account", 400);
  }
  return ctx.profile.school_id;
}

/** Check that the user has one of the allowed roles. */
export function requireRole(ctx: AuthContext, allowedRoles: string[]): void {
  if (!allowedRoles.includes(ctx.profile.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }
}

/**
 * Standard JSON success response.
 *
 * Cache-Control: private, max-age=30, stale-while-revalidate=60
 *   - private: browser may cache; CDN must not (auth-scoped data)
 *   - max-age=30: serve from browser cache for 30 s
 *   - stale-while-revalidate=60: after 30 s, serve stale while
 *     revalidating in the background for up to 60 s
 *
 * This matches the server-side Redis cache revalidateSeconds (60 s) and
 * the React Query staleTime (2 min). The three layers form a coherent
 * caching stack: browser HTTP cache → server Redis → Postgres.
 *
 * Write endpoints (POST / PATCH / DELETE) return their own Response
 * and never call successResponse, so this header never reaches them.
 */
export function successResponse<T>(data: T, status = 200) {
  return Response.json(
    { success: true, data },
    {
      status,
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}

/**
 * Extract HTTP status code from an error without using `any`.
 */
export function getErrorStatus(err: unknown): number {
  if (err instanceof AuthError) return err.status;
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "PGRST116") return 404;
    if (code === "PGRST301") return 409;
    if (code === "23505") return 409;
    if (code === "23503") return 400;
    if (code === "23514") return 400;
  }
  if (err instanceof Error && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  return 500;
}

export interface PaginatedEnvelope<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  status = 200,
) {
  return successResponse<PaginatedEnvelope<T>>(
    {
      items: items ?? [],
      total: total ?? 0,
      page,
      limit,
      totalPages: Math.ceil((total ?? 0) / limit),
    },
    status,
  );
}

/** Standard JSON error response. Never expose raw DB messages here. */
export function errorResponse(message: string, status = 500) {
  return Response.json({ success: false, error: message }, { status });
}

/**
 * The shape every Supabase / PostgREST error has in practice. We do
 * not depend on the SDK's `PostgrestError` type here because the
 * helper is called from a wide variety of contexts (PostgREST, raw
 * SQL via rpc, RLS rejections from .single(), etc.) and the SDK
 * sometimes narrows the type in ways that lose the `code` field.
 */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function asDbError(err: unknown): DbErrorLike {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
      details: typeof e.details === "string" ? e.details : undefined,
      hint: typeof e.hint === "string" ? e.hint : undefined,
    };
  }
  return { message: String(err) };
}

/**
 * Handles a Supabase/PostgreSQL error safely:
 * logs internally, returns a generic message to the client, and
 * captures the error to Sentry with the PostgREST code attached as
 * a tag so the team can filter "all 23505" reports.
 *
 * The signature takes `unknown` so callers can pass whatever their
 * SDK returned without having to assert a specific error type.
 */
export function dbError(
  error: unknown,
  clientMessage = "A database error occurred",
  status?: number,
  ctx?: { route?: string; school_id?: string | null; user_id?: string | null },
): Response {
  const e = asDbError(error);
  const code = e.code ?? "unknown";
  const detail = e.message ?? String(error);
  console.error(`[DB Error] code=${code}: ${detail}`);
  captureException(error, {
    level: "error",
    tags: { db_code: code, surface: ctx?.route ?? "api" },
    extra: {
      db_code: code,
      db_message: detail,
      db_details: e.details,
      db_hint: e.hint,
    },
    school_id: ctx?.school_id ?? null,
    user_id: ctx?.user_id ?? null,
    route: ctx?.route,
  });
  const resolvedStatus = status ?? statusFromPgCode(code) ?? 500;
  return Response.json({ success: false, error: clientMessage }, { status: resolvedStatus });
}

function statusFromPgCode(code: string): number | undefined {
  switch (code) {
    case "PGRST116": return 404;
    case "PGRST301":
    case "23505":    return 409;
    case "23503":
    case "23514":
    case "22P02":    return 400;
    case "42501":    return 403;
    default:         return undefined;
  }
}
