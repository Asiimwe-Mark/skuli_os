import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
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
    .single();

  if (!profile) {
    throw new AuthError("User profile not found", 404);
  }

  return { supabase: supabase as any, user, profile: profile as AuthContext["profile"] };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Check that the user belongs to a school.
 */
export function requireSchool(ctx: AuthContext): string {
  if (!ctx.profile.school_id) {
    throw new AuthError("No school associated with this account", 400);
  }
  return ctx.profile.school_id;
}

/**
 * Check that the user has one of the allowed roles.
 */
export function requireRole(ctx: AuthContext, allowedRoles: string[]): void {
  if (!allowedRoles.includes(ctx.profile.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }
}

/**
 * Standard JSON success response.
 */
export function successResponse<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

/**
 * Standard JSON error response.
 */
export function errorResponse(message: string, status = 500) {
  return Response.json({ success: false, error: message }, { status });
}
