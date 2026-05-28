import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher_id");
  const date = searchParams.get("date");

  let query = supabase
    .from("meeting_bookings")
    .select(`
      *,
      slot:meeting_slots!inner(teacher_id, slot_date, start_time, end_time),
      student:students(full_name, admission_number)
    `)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  if (teacherId) {
    query = query.eq("meeting_slots.teacher_id", teacherId);
  }
  if (date) {
    query = query.eq("meeting_slots.slot_date", date);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
