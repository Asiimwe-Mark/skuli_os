import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher_id");
  const date = searchParams.get("date");

  if (!teacherId || !date) {
    return NextResponse.json({ error: "teacher_id and date required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("meeting_slots")
    .select(`
      *,
      booking:meeting_bookings(id, student_id, parent_name, parent_phone, notes, status, student:students(full_name))
    `)
    .eq("teacher_id", teacherId)
    .eq("slot_date", date)
    .eq("is_deleted", false)
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { teacher_id, slot_date, start_time, end_time, duration_minutes } = body;

  if (!teacher_id || !slot_date || !start_time || !end_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const { error } = await supabase.rpc("generate_meeting_slots", {
    p_school_id: userProfile.school_id,
    p_teacher_id: teacher_id,
    p_slot_date: slot_date,
    p_start_time: start_time,
    p_end_time: end_time,
    p_duration_minutes: duration_minutes || 15,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
