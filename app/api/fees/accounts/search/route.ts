import { z } from "zod";
import { route, dbError } from "@/lib/http";

/**
 * GET /api/fees/accounts/search
 *
 * Server-side search for the student picker on the "Record Payment"
 * page. Returns at most `limit` students with an outstanding fee
 * account balance, filtered by `q` (matched against full_name or
 * admission_number via ilike).
 *
 * Audit 4.4 (9.9): the previous client-side implementation loaded
 * ALL 2000 fee accounts for the term in one query, then filtered
 * in JS. This endpoint caps the row count at the request size and
 * pushes the ilike to the database. The page calls it with a
 * debounced query as the user types.
 *
 * Capped at 50 results per call — the dropdown is `.slice(0, 10)`
 * anyway, so returning more is wasted bandwidth.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  term_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      term_id: url.searchParams.get("term_id") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      // The wrapper handles the schema-failure path for body
      // schemas; query-param schemas are validated inline because
      // Next.js handlers parse query params from `request.url`.
      return dbError(parsed.error, "Invalid query", 400);
    }
    const { q, term_id, limit } = parsed.data;

    // Build the base query: fee_accounts joined to student + class.
    let query = ctx.supabase
      .from("fee_accounts")
      .select(
        `id, balance, student:students(id, full_name, admission_number, parent_phone, current_class:classes(name))`,
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("balance", { ascending: false })
      .limit(limit);

    if (term_id) query = query.eq("term_id", term_id);

    // PostgREST cannot ilike-join across a relation, so we filter on
    // the student side via a sub-select when q is provided. That
    // costs one extra round-trip but keeps the result set bounded.
    let matchedIds: string[] | null = null;
    if (q && q.length >= 1) {
      const like = `%${q}%`;
      const { data: matchingStudents, error: studErr } = await ctx.supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .or(`full_name.ilike.${like},admission_number.ilike.${like}`)
        .limit(limit);

      if (studErr) return dbError(studErr, "Search failed");
      matchedIds = (matchingStudents ?? []).map((s) => s.id);
      if (matchedIds.length === 0) {
        return { students: [] };
      }
    }

    if (matchedIds) {
      query = query.in("student_id", matchedIds);
    }

    const { data, error } = await query;
    if (error) return dbError(error, "Failed to load fee accounts");

    type RawStudent = {
      id?: string;
      full_name?: string;
      admission_number?: string;
      parent_phone?: string;
      current_class?: { name?: string } | { name?: string }[] | null;
    };
    type RawRow = {
      id: string;
      balance: number;
      student?: RawStudent | RawStudent[] | null;
    };

    const students = (data ?? []).map((row) => {
      const r = row as unknown as RawRow;
      const s = (Array.isArray(r.student) ? r.student[0] : r.student) as
        | RawStudent
        | undefined;
      const cls = s?.current_class
        ? (Array.isArray(s.current_class) ? s.current_class[0] : s.current_class)
        : undefined;
      return {
        id: s?.id ?? "",
        full_name: s?.full_name ?? "Unknown",
        admission_number: s?.admission_number ?? "",
        balance: r.balance,
        fee_account_id: r.id,
        class_name: cls?.name ?? "",
        parent_phone: s?.parent_phone ?? "",
      };
    });

    return { students };
  },
});
