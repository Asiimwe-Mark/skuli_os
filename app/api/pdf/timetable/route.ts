import { route, errorResponse } from "@/lib/http";
import { generateTimetablePDF } from "@/lib/pdf/timetable";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const supabase = ctx.supabase;
    const searchParams = request.nextUrl.searchParams;
    const classId = searchParams.get("classId");
    const yearId = searchParams.get("yearId");

    if (!classId || !yearId) {
      return errorResponse("classId and yearId are required", 400);
    }

    // Fetch school details (explicit school_id filter — defense in depth)
    const { data: school, error: schoolFetchError } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    if (schoolFetchError || !school) {
      return errorResponse("School not found", 404);
    }

    // Fetch class details (scoped to school)
    const { data: classData, error: classFetchError } = await supabase
      .from("classes")
      .select("name")
      .eq("id", classId)
      .eq("school_id", schoolId)
      .single();

    if (classFetchError || !classData) {
      return errorResponse("Class not found", 404);
    }

    // Fetch academic year details (scoped to school)
    const { data: yearData, error: yearFetchError } = await supabase
      .from("academic_years")
      .select("name")
      .eq("id", yearId)
      .eq("school_id", schoolId)
      .single();

    if (yearFetchError || !yearData) {
      return errorResponse("Academic year not found", 404);
    }

    // Fetch periods
    const { data: periods, error: periodsError } = await supabase
      .from("timetable_periods")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("sort_order");

    if (periodsError) throw periodsError;

    // Fetch slots with details
    const { data: slotsData, error: slotsError } = await supabase
      .from("timetable_slots")
      .select(`
        *,
        subject:subjects(id, name, color),
        teacher:users(id, full_name)
      `)
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("academic_year_id", yearId)
      .eq("is_deleted", false);

    if (slotsError) throw slotsError;

    const slots = (slotsData || []).map((s: {
      id: string;
      period_id: string;
      day_of_week: number;
      subject: unknown;
      teacher: unknown;
      room: string | null;
    }) => ({
      id: s.id,
      period_id: s.period_id,
      day_of_week: s.day_of_week,
      subject: (s.subject ?? null) as
        | { name: string | null; color?: string | null }
        | null,
      teacher:
        s.teacher && typeof s.teacher === "object"
          ? {
              full_name: ((s.teacher as { full_name?: unknown }).full_name ??
                null) as string | null,
            }
          : null,
      room: s.room,
    }));

    // Generate PDF
    const pdfBlob = await generateTimetablePDF(
      school.name,
      classData.name,
      yearData.name,
      periods || [],
      slots
    );

    // Migration guide §7.3: PDF routes return a binary blob. The
    // route() wrapper passes a Response through unchanged.
    return new Response(pdfBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="timetable-${classData.name}.pdf"`,
      },
    });
  },
});
