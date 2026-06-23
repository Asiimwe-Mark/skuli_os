import { route, errorResponse, dbError } from "@/lib/http";
import { sendPushToUser } from "@/lib/push";
import { invalidateSchoolAsync } from "@/lib/api-cache";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const body = await request.json();
    const { class_id, term_id } = body;

    if (!class_id || !term_id) {
      return errorResponse("class_id and term_id are required", 400);
    }

    const { data: reportCards, error: fetchError } = await ctx.supabase
      .from("report_cards")
      .select("id, student_id, students(full_name, parent_phone)")
      .eq("school_id", ctx.schoolId)
      .eq("class_id", class_id)
      .eq("term_id", term_id)
      .eq("is_published", false);

    if (fetchError) return dbError(fetchError, "Failed to fetch data");
    if (!reportCards || reportCards.length === 0) {
      return { published: 0 };
    }

    let published = 0;
    const pushJobs: Array<Promise<unknown>> = [];

    for (const rc of reportCards) {
      const { error: updateError } = await ctx.supabase
        .from("report_cards")
        .update({ is_published: true })
        .eq("id", rc.id);

      if (updateError) continue;
      published++;

      try {
        const student = rc.students as unknown as { full_name: string } | null;
        if (student) {
          const lookup: Promise<{ parent_id: string } | null> = Promise.resolve(
            ctx.supabase
              .from("parent_students")
              .select("parent_id")
              .eq("student_id", rc.student_id)
              .maybeSingle()
              .then((res: { data: { parent_id: string } | null }) => res.data),
          );
          pushJobs.push(
            lookup
              .then((parentLink) => {
                if (parentLink?.parent_id) {
                  return sendPushToUser(ctx.supabase, parentLink.parent_id, {
                    title: "Report Card Ready",
                    body: `${student.full_name}'s report card is now available`,
                    url: "/portal/results",
                  });
                }
                return null;
              })
              .catch(() => null),
          );
        }
      } catch {
        // Push planning failure should not block publishing
      }
    }

    // Parallel push fan-out, never blocks the response.
    void Promise.allSettled(pushJobs).catch(() => undefined);

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "report_cards_published",
      entity_type: "report_card",
      entity_id: null,
      old_value: null,
      new_value: { class_id, term_id, count: published },
    } as never);

    void invalidateSchoolAsync(ctx.schoolId);

    return { published };
  },
});
