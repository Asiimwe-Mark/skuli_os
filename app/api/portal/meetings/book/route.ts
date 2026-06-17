import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const body = await req.json();
    const { slot_id, student_id, notes } = body;

    if (!slot_id || !student_id) {
      return errorResponse("slot_id and student_id are required", 400);
    }

    const supabase = ctx.supabase;

    // SECURITY (audit H-2): verify parent_students link FIRST so an
    // unlinked parent cannot even lock a slot. The previous version
    // atomically claimed the slot before checking the link, which
    // meant a parent with no link row could lock another student's
    // slot. parent_students is the sole authority — no phone fallback.
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", student_id)
      .maybeSingle();

    if (!parentLink) {
      return errorResponse("Not linked to this student", 403);
    }

    // Get parent's profile info (don't trust client-supplied name/phone)
    const { data: parentProfile } = await supabase
      .from("users")
      .select("full_name, phone")
      .eq("id", ctx.user.id)
      .maybeSingle();

    const parentName = parentProfile?.full_name ?? "Parent";
    const parentPhone = parentProfile?.phone ?? "";

    // Check slot availability with atomic update to prevent double-booking.
    // We scope to the same school as the parent student — a slot from
    // a different school cannot be claimed even if the parent knew the
    // slot_id.
    const { data: studentSchool } = await supabase
      .from("students")
      .select("school_id")
      .eq("id", student_id)
      .maybeSingle();

    if (!studentSchool) {
      return errorResponse("Student not found", 404);
    }

    const { data: slot, error: slotError } = await supabase
      .from("meeting_slots")
      .update({ is_booked: true })
      .eq("id", slot_id)
      .eq("school_id", studentSchool.school_id)
      .eq("is_booked", false)
      .eq("is_deleted", false)
      .select("id, school_id, teacher_id, slot_date, start_time, end_time")
      .single();

    if (slotError || !slot) {
      return errorResponse("Slot not available or already booked", 400);
    }

    const { data: booking, error: bookingError } = await supabase
      .from("meeting_bookings")
      .insert({
        slot_id,
        school_id: slot.school_id,
        student_id,
        parent_name: parentName,
        parent_phone: parentPhone,
        notes: notes ?? null,
        status: "pending" as const,
        reminder_sent: false,
      })
      .select()
      .single();

    if (bookingError) return dbError(bookingError, "Failed to book meeting", 500);

    // Send confirmation SMS (fire-and-forget)
    const { data: staff } = await supabase
      .from("staff")
      .select("full_name")
      .eq("id", slot.teacher_id)
      .single();

    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", slot.school_id)
      .single();

    if (parentPhone) {
      await supabase.from("sms_logs").insert({
        school_id: slot.school_id,
        recipient_phone: parentPhone,
        message_body: `Your meeting request with ${staff?.full_name ?? "teacher"} on ${slot.slot_date} at ${slot.start_time} has been received. Awaiting teacher confirmation. School: ${school?.name ?? ""}`,
        message_type: "meeting_confirmation",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: booking.id,
        sent_at: null,
        africa_talking_message_id: null,
        cost: null,
      });
    }

    return successResponse(booking, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}
