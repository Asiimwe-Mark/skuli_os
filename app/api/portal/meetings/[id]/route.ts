import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { id } = await params;
    const supabase = ctx.supabase;

    const { data: booking } = await supabase
      .from("meeting_bookings")
      .select("id, slot_id, school_id, student_id, parent_phone")
      .eq("id", id)
      .single();

    if (!booking) return errorResponse("Not found", 404);

    // Verify parent is linked to this student
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", booking.student_id)
      .maybeSingle();

    if (!parentLink) {
      return errorResponse("Not linked to this student", 403);
    }

    const { data, error } = await supabase
      .from("meeting_bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await supabase
      .from("meeting_slots")
      .update({ is_booked: false })
      .eq("id", booking.slot_id);

    const { data: slot } = await supabase
      .from("meeting_slots")
      .select("slot_date, start_time, teacher:staff(full_name)")
      .eq("id", booking.slot_id)
      .single();

    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", booking.school_id)
      .single();

    if (slot && school && booking.parent_phone) {
      const teacherName = (slot.teacher as unknown as { full_name: string } | null)?.full_name ?? "your teacher";
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: `Your meeting with ${teacherName} on ${slot.slot_date} at ${slot.start_time} has been cancelled. School: ${school.name}`,
        message_type: "meeting_cancellation",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
        sent_at: null,
        africa_talking_message_id: null,
        cost: null,
      });
    }

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}
