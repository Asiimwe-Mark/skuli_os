import { route, dbError } from "@/lib/http";

export const GET = route({
  // The original handler had no role gate; it implicitly allowed any
  // signed-in user with a school. We keep that contract: any signed-in
  // role for a school that has bookings can read them. SUPER_ADMIN
  // bypasses the school guard from inside the wrapper.
  roles: [],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");
    const date = searchParams.get("date");

    let query = ctx.supabase
      .from("meeting_bookings")
      .select(`
        *,
        slot:meeting_slots!inner(teacher_id, slot_date, start_time, end_time),
        student:students(full_name, admission_number)
      `)
      .eq("school_id", schoolId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });

    if (teacherId) {
      query = query.eq("meeting_slots.teacher_id", teacherId);
    }
    if (date) {
      query = query.eq("meeting_slots.slot_date", date);
    }

    const { data, error } = await query;
    if (error) return dbError(error, "Failed to load bookings");
    return data ?? [];
  },
});
