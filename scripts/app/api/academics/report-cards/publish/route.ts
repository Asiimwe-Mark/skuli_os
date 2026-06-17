import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const body = await request.json();
    const { class_id, term_id } = body;

    if (!class_id || !term_id) {
      return errorResponse("class_id and term_id are required", 400);
    }

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
      return successResponse({ published: 0 });
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

      // Push notification to parent
      try {
        const student = rc.students as unknown as { full_name: string; parent_phone: string | null } | null;
        if (student?.parent_phone) {
          const { data: parentUser } = await ctx.supabase
            .from("users")
            .select("id")
            .eq("phone", student.parent_phone)
            .eq("role", "PARENT")
            .single();

          if (parentUser) {
            await sendPushToUser(ctx.supabase, parentUser.id, {
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

    return successResponse({ published });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}
