import { route, AuthError, dbError } from "@/lib/http";

export const POST = route({
  roles: ["PARENT"],
  handler: async (ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      slot_id?: string;
      student_id?: string;
      notes?: string;
    };

    if (!body.slot_id || !body.student_id) {
      throw new AuthError("slot_id and student_id are required", 400);
    }

    const supabase = ctx.supabase;

    // SECURITY (audit H-2): verify parent_students link FIRST so an
    // unlinked parent cannot even lock a slot. parent_students is
    // the sole authority — no phone fallback.
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", body.student_id)
      .maybeSingle();

    if (!parentLink) {
      throw new AuthError("Not linked to this student", 403);
    }

    const { data: parentProfile } = await supabase
      .from("users")
      .select("full_name, phone")
      .eq("id", ctx.user.id)
      .maybeSingle();

    const parentName = parentProfile?.full_name ?? "Parent";
    const parentPhone = parentProfile?.phone ?? "";

    const { data: studentSchool } = await supabase
      .from("students")
      .select("school_id")
      .eq("id", body.student_id)
      .maybeSingle();

    if (!studentSchool) {
      throw new AuthError("Student not found", 404);
    }

    const { data: slot, error: slotError } = await supabase
      .from("meeting_slots")
      .update({ is_booked: true })
      .eq("id", body.slot_id)
      .eq("school_id", studentSchool.school_id)
      .eq("is_booked", false)
      .eq("is_deleted", false)
      .select("id, school_id, teacher_id, slot_date, start_time, end_time")
      .single();

    if (slotError || !slot) {
      throw new AuthError("Slot not available or already booked", 400);
    }

    const { data: booking, error: bookingError } = await supabase
      .from("meeting_bookings")
      .insert({
        slot_id: body.slot_id,
        school_id: slot.school_id,
        student_id: body.student_id,
        parent_name: parentName,
        parent_phone: parentPhone,
        notes: body.notes ?? null,
        status: "pending" as const,
        reminder_sent: false,
      })
      .select()
      .single();

    if (bookingError)
      return dbError(bookingError, "Failed to book meeting", 500);

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

    return booking;
  },
});