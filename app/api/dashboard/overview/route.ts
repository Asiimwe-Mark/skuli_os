/**
 * GET /api/dashboard/overview
 *
 * One-call replacement for the 14 parallel Supabase queries the
 * dashboard page used to fire from the browser. Backed by the
 * `dashboard_overview(p_school_id, p_term_id, p_date)` SQL
 * function added in migration 0044.
 *
 * Cache strategy
 * --------------
 * The route goes through `withSchoolReadCache` so the response
 * is cached per (school, term, date) for 60 s in Redis. A
 * mutation handler that calls `invalidateSchoolAsync(schoolId)`
 * purges every variant for that school on the next tick.
 *
 * Query string
 * ------------
 *   ?term_id=<uuid>&date=<YYYY-MM-DD>
 * Both are optional; `date` defaults to today (local Y-M-D for
 * the school — the dashboard cares about "today in Uganda", not
 * UTC), `term_id` defaults to the current term for the school.
 */

import { route, paginated, respond, withSchoolReadCache } from "@/lib/http";
import { getOverview } from "@/lib/services/dashboard";
import { todayLocalISODate } from "@/lib/utils/dates";
import { scopedQuery } from "@/lib/http/scoped";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const termId = url.searchParams.get("term_id");
    const dateParam = url.searchParams.get("date");

    // Resolve term — explicit query param wins; otherwise the
    // school's current term. Pulled into the cache key so a
    // school that switches terms picks up a fresh aggregate.
    let resolvedTermId = termId;
    if (!resolvedTermId) {
      const { data: term } = await scopedQuery(ctx, "terms")
        .select("id")
        .eq("is_current", true)
        .maybeSingle();
      resolvedTermId = term?.id ?? null;
    }

    const date = dateParam ?? todayLocalISODate();
    const inputShape = `dashboard-overview:${resolvedTermId ?? "_"}:${date}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId: ctx.schoolId, inputShape },
      async () => getOverview(ctx, { termId: resolvedTermId, date }),
    );

    // The dashboard payload is large; ensure pagination parser
    // doesn't accidentally run on it (paginated.parse is for
    // list endpoints, kept available for handlers that need it).
    void paginated;

    return applyTo(respond.cacheable(value));
  },
});