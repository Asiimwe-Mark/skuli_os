import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["cancelled", "completed"].includes(status)) {
    return NextResponse.json({ error: "status must be cancelled or completed" }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from("meeting_bookings")
    .select("slot_id, school_id, parent_phone, parent_name")
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

  if (status === "cancelled") {
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
  }

  return NextResponse.json(data);
}
