import { route, errorResponse, dbError } from "@/lib/http";
import { sendPushToUser } from "@/lib/push";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const body = await request.json();
    const { class_id, term_id } = body;

    if (!class_id || !term_id) {
      return errorResponse("class_id and term_id are required", 400);
    }

    // Audit §14.1: a TEACHER used to be allowed here, but publishing
    // report cards exposes grades to parents and is the gate that
    // makes the row visible in `parent_own_report_cards` (which
    // requires is_published = true). Restrict to SCHOOL_ADMIN
    // (SUPER_ADMIN for support). Class-teacher TEACHERs can still
    // be added by a follow-up migration that mirrors the
    // teacher_class_assignments check used by `marks`.

    // Find unpublished report cards for this class/term
    const { data: reportCards, error: fetchError } = await ctx.supabase
      .from("report_cards")
      .select("id, student_id, students(full_name, parent_phone)")
      .eq("school_id", schoolId)
      .eq("class_id", class_id)
      .eq("term_id", term_id)
      .eq("is_published", false);

    if (fetchError) return dbError(fetchError, "Failed to fetch data");
    if (!reportCards || reportCards.length === 0) {
      return { published: 0 };
    }

    let published = 0;

    for (const rc of reportCards) {
      // Publish the report card
      const { error: updateError } = await ctx.supabase
        .from("report_cards")
        .update({ is_published: true })
        .eq("id", rc.id);

      if (updateError) continue;
      published++;

      // Audit §14.6: resolve parent via parent_students instead of
      // the mutable phone column. Phones get reused / reassigned;
      // a previous parent might receive the new student's grade.
      try {
        const student = rc.students as unknown as { full_name: string } | null;
        if (student) {
          const { data: parentLink } = await ctx.supabase
            .from("parent_students")
            .select("parent_id")
            .eq("student_id", rc.student_id)
            .maybeSingle();

          if (parentLink?.parent_id) {
            await sendPushToUser(ctx.supabase, parentLink.parent_id, {
              title: "Report Card Ready",
              body: `${student.full_name}'s report card is now available`,
              url: "/portal/results",
            });
          }
        }
      } catch {
        // Push failure should not block publishing
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "report_cards_published",
      entity_type: "report_card",
      entity_id: null,
      old_value: null,
      new_value: { class_id, term_id, count: published },
      ip_address: null,
    });

    return { published };
  },
});
