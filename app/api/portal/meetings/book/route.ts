import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { slot_id, student_id, parent_name, parent_phone, notes } = body;

  if (!slot_id || !student_id || !parent_name || !parent_phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: slot } = await supabase
    .from("meeting_slots")
    .select("id, school_id, is_booked, is_deleted, teacher_id, slot_date, start_time, end_time")
    .eq("id", slot_id)
    .single();

  if (!slot || slot.is_booked || slot.is_deleted) {
    return NextResponse.json({ error: "Slot not available" }, { status: 400 });
  }

  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", student_id)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("meeting_bookings")
    .insert({
      slot_id,
      school_id: slot.school_id,
      student_id,
      parent_name,
      parent_phone,
      notes,
    })
    .select()
    .single();

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });

  await supabase
    .from("meeting_slots")
    .update({ is_booked: true })
    .eq("id", slot_id);

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

  await supabase.from("sms_logs").insert({
    school_id: slot.school_id,
    recipient_phone: parent_phone,
    message_body: `Your meeting with ${staff?.full_name ?? "teacher"} on ${slot.slot_date} at ${slot.start_time} is confirmed. School: ${school?.name ?? ""}`,
    message_type: "meeting_confirmation",
    status: "pending",
    related_entity_type: "meeting_booking",
    related_entity_id: booking.id,
  });

  return NextResponse.json(booking);
}
