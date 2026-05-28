import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: booking } = await supabase
    .from("meeting_bookings")
    .select("id, slot_id, school_id, student_id, parent_phone")
    .eq("id", id)
    .single();

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", booking.student_id)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("meeting_bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  if (slot && school) {
    const teacherName = (slot.teacher as Record<string, unknown>)?.full_name ?? "your teacher";
    await supabase.from("sms_logs").insert({
      school_id: booking.school_id,
      recipient_phone: booking.parent_phone,
      message_body: `Your meeting with ${teacherName} on ${slot.slot_date} at ${slot.start_time} has been cancelled. School: ${school.name}`,
      message_type: "meeting_cancellation",
      status: "pending",
      related_entity_type: "meeting_booking",
      related_entity_id: id,
    });
  }

  return NextResponse.json(data);
}
