import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId) {
    return NextResponse.json({ error: "student_id required" }, { status: 400 });
  }

  const { data: student } = await supabase
    .from("students")
    .select("current_class_id, classes(class_teacher_id, name)")
    .eq("id", studentId)
    .single();

  if (!student?.current_class_id) {
    return NextResponse.json([]);
  }

  const classData = student.classes as Record<string, unknown> | null;
  const classTeacherId = classData?.class_teacher_id as string | null;

  if (!classTeacherId) {
    return NextResponse.json([]);
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, role_title")
    .eq("user_id", classTeacherId)
    .eq("is_active", true)
    .single();

  if (!staff) return NextResponse.json([]);
  return NextResponse.json([staff]);
}
