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
    .select("id, slot_date, start_time, end_time, duration_minutes")
    .eq("teacher_id", teacherId)
    .eq("slot_date", date)
    .eq("is_booked", false)
    .eq("is_deleted", false)
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
