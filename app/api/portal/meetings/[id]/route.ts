import { route, AuthError, dbError } from "@/lib/http";

export const PATCH = route({
  roles: ["PARENT"],
  handler: async (ctx, _request, params) => {
    const { id } = (params ?? {}) as { id: string };
    const supabase = ctx.supabase;

    const { data: booking } = await supabase
      .from("meeting_bookings")
      .select("id, slot_id, school_id, student_id, parent_phone")
      .eq("id", id)
      .single();

    if (!booking) throw new AuthError("Not found", 404);

    // SECURITY (audit H-2): parent_students is the sole authority.
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", booking.student_id)
      .maybeSingle();

    if (!parentLink) {
      throw new AuthError("Not linked to this student", 403);
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
      const teacherName =
        (slot.teacher as unknown as { full_name: string } | null)
          ?.full_name ?? "your teacher";
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

    return data;
  },
});