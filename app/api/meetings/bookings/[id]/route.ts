import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { status, notify_via = "in_app" } = body;

  if (!["confirmed", "cancelled", "completed"].includes(status)) {
    return NextResponse.json({ error: "status must be confirmed, cancelled, or completed" }, { status: 400 });
  }

  if (!["in_app", "sms"].includes(notify_via)) {
    return NextResponse.json({ error: "notify_via must be in_app or sms" }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from("meeting_bookings")
    .select("slot_id, school_id, student_id, parent_phone, parent_name")
    .eq("id", id)
    .single();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("meeting_bookings")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  const teacherName = slot
    ? (slot.teacher as Record<string, unknown>)?.full_name ?? "your teacher"
    : "your teacher";
  const slotDate = slot?.slot_date ?? "the scheduled date";
  const slotTime = slot?.start_time ?? "";
  const schoolName = school?.name ?? "";

  // Look up parent user_id for in-app notifications
  let parentUserId: string | null = null;
  if (notify_via === "in_app" && booking.student_id) {
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("parent_id")
      .eq("student_id", booking.student_id)
      .limit(1)
      .maybeSingle();
    parentUserId = parentLink?.parent_id ?? null;
  }

  if (status === "confirmed") {
    if (notify_via === "in_app" && parentUserId) {
      await supabase.from("in_app_notifications").insert({
        school_id: booking.school_id,
        recipient_user_id: parentUserId,
        title: "Meeting Confirmed",
        body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been confirmed. School: ${schoolName}`,
        type: "success",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
      });
    } else {
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been confirmed. School: ${schoolName}`,
        message_type: "meeting_confirmation",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
      });
    }
  }

  if (status === "cancelled") {
    await supabase
      .from("meeting_slots")
      .update({ is_booked: false })
      .eq("id", booking.slot_id);

    if (notify_via === "in_app" && parentUserId) {
      await supabase.from("in_app_notifications").insert({
        school_id: booking.school_id,
        recipient_user_id: parentUserId,
        title: "Meeting Declined",
        body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been declined. School: ${schoolName}`,
        type: "warning",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
      });
    } else {
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: `Your meeting with ${teacherName} on ${slotDate} at ${slotTime} has been cancelled. School: ${schoolName}`,
        message_type: "meeting_cancellation",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
      });
    }
  }

  return NextResponse.json(data);
}
