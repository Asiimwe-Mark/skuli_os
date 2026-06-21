import type { Database } from "@/types/database";
import { route, AuthError, dbError } from "@/lib/http";

const patchSchema = {
  status: ["pending", "confirmed", "cancelled", "completed"] as const,
  notify_via: ["in_app", "sms"] as const,
};

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "BURSAR"],
  handler: async (ctx, request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = (params ?? {}) as { id: string };
    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      notify_via?: string;
    };
    const status = body.status;
    const notify_via = body.notify_via ?? "in_app";

    if (
      !status ||
      !(patchSchema.status as readonly string[]).includes(status)
    ) {
      throw new AuthError(
        "status must be confirmed, cancelled, or completed",
        400,
      );
    }

    if (!(patchSchema.notify_via as readonly string[]).includes(notify_via)) {
      throw new AuthError("notify_via must be in_app or sms", 400);
    }

    const { data: booking, error: bookErr } = await ctx.supabase
      .from("meeting_bookings")
      .select("slot_id, school_id, student_id, parent_phone, parent_name")
      .eq("id", id)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (bookErr) return dbError(bookErr, "Failed to load booking");
    if (!booking) throw new AuthError("Booking not found", 404);

    const { data, error } = await ctx.supabase
      .from("meeting_bookings")
      .update({ status })
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Failed to update booking");

    const { data: slot } = await ctx.supabase
      .from("meeting_slots")
      .select("slot_date, start_time, teacher:staff(full_name)")
      .eq("id", booking.slot_id)
      .maybeSingle();

    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", booking.school_id)
      .maybeSingle();

    const teacherName = slot
      ? (slot.teacher as unknown as { full_name?: string } | null)
          ?.full_name ?? "your teacher"
      : "your teacher";
    const slotDate = slot?.slot_date ?? "the scheduled date";
    const slotTime = slot?.start_time ?? "";
    const schoolName = school?.name ?? "";

    let parentUserId: string | null = null;
    if (notify_via === "in_app" && booking.student_id) {
      const { data: parentLink } = await ctx.supabase
        .from("parent_students")
        .select("parent_id")
        .eq("student_id", booking.student_id)
        .limit(1)
        .maybeSingle();
      parentUserId = parentLink?.parent_id ?? null;
    }

    if (status === "confirmed") {
      if (notify_via === "in_app" && parentUserId) {
        await ctx.supabase.from("in_app_notifications").insert({
          school_id: booking.school_id,
          recipient_user_id: parentUserId,
          title: "Meeting Confirmed",
          body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been confirmed. School: ${schoolName}`,
          type: "success",
          is_read: false,
          related_entity_type: "meeting_booking",
          related_entity_id: id,
        } as Database["public"]["Tables"]["in_app_notifications"]["Insert"]);
      } else {
        await ctx.supabase.from("sms_logs").insert({
          school_id: booking.school_id,
          recipient_phone: booking.parent_phone,
          message_body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been confirmed. School: ${schoolName}`,
          message_type: "meeting_confirmation",
          status: "pending",
          related_entity_type: "meeting_booking",
          related_entity_id: id,
          sent_at: null,
          africa_talking_message_id: null,
          cost: null,
        } as Database["public"]["Tables"]["sms_logs"]["Insert"]);
      }
    }

    if (status === "cancelled") {
      await ctx.supabase
        .from("meeting_slots")
        .update({ is_booked: false })
        .eq("id", booking.slot_id);

      if (notify_via === "in_app" && parentUserId) {
        await ctx.supabase.from("in_app_notifications").insert({
          school_id: booking.school_id,
          recipient_user_id: parentUserId,
          title: "Meeting Declined",
          body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been declined. School: ${schoolName}`,
          type: "warning",
          is_read: false,
          related_entity_type: "meeting_booking",
          related_entity_id: id,
        } as Database["public"]["Tables"]["in_app_notifications"]["Insert"]);
      } else {
        await ctx.supabase.from("sms_logs").insert({
          school_id: booking.school_id,
          recipient_phone: booking.parent_phone,
          message_body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been cancelled. School: ${schoolName}`,
          message_type: "meeting_cancellation",
          status: "pending",
          related_entity_type: "meeting_booking",
          related_entity_id: id,
          sent_at: null,
          africa_talking_message_id: null,
          cost: null,
        } as Database["public"]["Tables"]["sms_logs"]["Insert"]);
      }
    }

    return data;
  },
});