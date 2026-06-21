import { route, dbError, errorResponse } from "@/lib/http";

export const GET = route({
  roles: ["PARENT"],
  handler: async (ctx, request) => {
    const supabase = ctx.supabase;
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");

    if (!studentId) {
      return errorResponse("student_id required", 400);
    }

    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent. The previous version fell
    // back to a parent_phone match — phone numbers are mutable and
    // not unique, so any parent who happened to share a phone with
    // another parent's child could read that child's meeting
    // bookings. We now require a parent_students link row only.
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentLink) {
      return errorResponse("Not linked to this student", 403);
    }

    const { data, error } = await supabase
      .from("meeting_bookings")
      .select(`
        *,
        slot:meeting_slots(slot_date, start_time, end_time, teacher:staff(full_name)),
        student:students(full_name)
      `)
      .eq("student_id", studentId)
      .in("status", ["confirmed", "completed"])
      .order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");
    return data ?? [];
  },
});
