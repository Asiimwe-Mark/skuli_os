// app/api/communication/threads/route.ts
import { route, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const supabase = ctx.supabase;
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    // Audit 4.3 (9.6): previously the route returned every thread
    // in the school, then ran an in-memory full_name filter. For a
    // school with 10k parents and 5+ years of comms, that's a
    // multi-MB response. Add page/limit pagination, defaulting to
    // 50 per page. The post-query full_name match still works
    // because we only run it against the current page.
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Audit 2.2 (3.38, 4.10, 5.55): a previous version did
    //   .or(`parent_phone.ilike.%${search}%,student.full_name.ilike.%${search}%`)
    // which PostgREST rejects on some schema-cache states with
    // "Could not find a relationship between 'message_threads' and
    // 'students'". The fix is to keep the relation filter on the
    // joined select but do the full_name match in code after the
    // row comes back. The DB still filters by parent_phone so the
    // result set stays bounded.
    let query = supabase
      .from("message_threads")
      .select(`
        *,
        student:students(full_name, admission_number)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("last_message_at", { ascending: false });

    if (search) {
      query = query.ilike("parent_phone", `%${search}%`);
    }

    // Apply pagination at the SQL level. Note: when the in-code
    // full_name filter drops rows, the returned page may be smaller
    // than `limit`. The client should treat the in-code filter as
    // best-effort; the next page is the next SQL page.
    const { data: threads, error, count } = await query.range(from, to);
    if (error) return dbError(error, "Database error");

    const lowerSearch = search.toLowerCase();
    const filtered = (threads ?? []).filter((t) => {
      if (!lowerSearch) return true;
      const student = (t as { student?: { full_name?: string | null } }).student;
      if (student?.full_name?.toLowerCase().includes(lowerSearch)) return true;
      return false;
    });

    const threadIds = filtered.map((t: { id: string }) => t.id);
    const lastMessages: Record<string, { body: string; direction: string }> = {};

    if (threadIds.length > 0) {
      const { data: msgs } = await supabase
        .from("thread_messages")
        .select("thread_id, body, direction, sent_at")
        .in("thread_id", threadIds)
        .eq("is_deleted", false)
        .order("sent_at", { ascending: false });

      if (msgs) {
        for (const msg of msgs) {
          if (!lastMessages[msg.thread_id]) {
            lastMessages[msg.thread_id] = { body: msg.body, direction: msg.direction };
          }
        }
      }
    }

    const result = filtered.map((t: { id: string; [key: string]: unknown }) => ({
      ...t,
      last_message: lastMessages[t.id] || null,
    }));

    return {
      threads: result,
      total: count ?? result.length,
      page,
      limit,
      totalPages: Math.ceil((count ?? result.length) / limit),
    };
  },
});
