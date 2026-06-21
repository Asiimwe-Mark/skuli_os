import { route, AuthError } from "@/lib/http";
import { generateCalendarPDF } from "@/lib/pdf/calendar";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const month = request.nextUrl.searchParams.get("month");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AuthError(
        "Missing or invalid month param (yyyy-MM)",
        400,
      );
    }

    const schoolId = ctx.profile.school_id!;
    const { supabase } = ctx;

    const { data: school, error: schoolFetchError } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    if (schoolFetchError || !school) {
      throw new AuthError("School not found", 404);
    }

    const [year, monthNum] = month.split("-").map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${new Date(year, monthNum, 0).getDate()}`;

    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("school_id", schoolId)
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date", { ascending: true });

    if (eventsError) {
      throw new AuthError(eventsError.message, 500);
    }

    const blob = await generateCalendarPDF(school.name, month, events || []);
    const buffer = await blob.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="calendar-${month}.pdf"`,
      },
    });
  },
});