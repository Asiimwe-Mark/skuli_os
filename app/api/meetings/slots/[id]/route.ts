import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { is_deleted } = body;

  if (typeof is_deleted !== "boolean") {
    return NextResponse.json({ error: "is_deleted boolean required" }, { status: 400 });
  }

  if (is_deleted) {
    await supabase
      .from("meeting_bookings")
      .update({ status: "cancelled" })
      .eq("slot_id", id)
      .eq("status", "confirmed");
  }

  const { data, error } = await supabase
    .from("meeting_slots")
    .update({ is_deleted })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
