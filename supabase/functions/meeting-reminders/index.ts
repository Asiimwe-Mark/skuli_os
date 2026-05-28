// Supabase Edge Function: meeting-reminders
// Daily cron at 8AM EAT — finds tomorrow's bookings, sends reminder SMS via sms_logs
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find confirmed bookings for tomorrow that haven't been reminded
    const { data: bookings, error } = await supabase
      .from("meeting_bookings")
      .select(`
        id,
        school_id,
        parent_phone,
        parent_name,
        slot:meeting_slots!inner(
          slot_date,
          start_time,
          end_time,
          teacher:staff(full_name)
        ),
        school:schools(name)
      `)
      .eq("status", "confirmed")
      .eq("reminder_sent", false)
      .eq("meeting_slots.slot_date", tomorrowStr);

    if (error) throw error;
    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders to send" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;

    for (const booking of bookings) {
      const slot = booking.slot as unknown as {
        slot_date: string;
        start_time: string;
        teacher: { full_name: string } | null;
      };
      const school = booking.school as unknown as { name: string } | null;

      const teacherName = slot?.teacher?.full_name ?? "your teacher";
      const schoolName = school?.name ?? "school";
      const time = slot?.start_time ?? "";

      const message = `Reminder: You have a parent-teacher meeting at ${schoolName} tomorrow at ${time} with ${teacherName}.`;

      // Queue SMS
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: message,
        message_type: "meeting_reminder",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: booking.id,
      });

      // Mark reminder as sent
      await supabase
        .from("meeting_bookings")
        .update({ reminder_sent: true })
        .eq("id", booking.id);

      sent++;
    }

    return new Response(
      JSON.stringify({ message: `Queued ${sent} meeting reminders` }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
