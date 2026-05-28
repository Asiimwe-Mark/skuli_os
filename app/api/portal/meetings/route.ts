import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId) {
    return NextResponse.json({ error: "student_id required" }, { status: 400 });
  }

  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", studentId)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("meeting_bookings")
    .select(`
      *,
      slot:meeting_slots(slot_date, start_time, end_time, teacher:staff(full_name)),
      student:students(full_name)
    `)
    .eq("student_id", studentId)
    .in("status", ["confirmed", "completed"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
