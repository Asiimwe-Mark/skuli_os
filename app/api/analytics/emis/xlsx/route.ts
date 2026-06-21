import * as XLSX from "xlsx";
import { route } from "@/lib/http";
import { aggregateEmisData } from "@/lib/emis/aggregate";
import { emisReportSchema } from "@/lib/validations/emis";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: emisReportSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { academic_year_id, term_id } = body;
    const data = await aggregateEmisData(ctx.supabase, schoolId, term_id);

    const wb = XLSX.utils.book_new();

    const infoSheet = XLSX.utils.aoa_to_sheet([
      ["School Name", data.school.name],
      ["District", data.school.district],
      ["School Code", data.school.schoolCode],
      ["School Type", data.school.schoolType],
      ["Subscription Plan", data.school.subscriptionPlan],
      ["Term", data.termName],
    ]);
    XLSX.utils.book_append_sheet(wb, infoSheet, "School Info");

    const classSheet = XLSX.utils.json_to_sheet(
      data.enrolmentByClass.map((r) => ({
        Class: r.className,
        Boys: r.boys,
        Girls: r.girls,
        Total: r.total,
      })),
    );
    XLSX.utils.book_append_sheet(wb, classSheet, "Enrolment by Class");

    const ageSheet = XLSX.utils.json_to_sheet(
      data.enrolmentByAge.map((r) => ({
        "Age group": r.bracket,
        Boys: r.boys,
        Girls: r.girls,
        Total: r.total,
      })),
    );
    XLSX.utils.book_append_sheet(wb, ageSheet, "Enrolment by Age");

    const staffSheet = XLSX.utils.aoa_to_sheet([
      ["Total active staff", data.staff.totalActive],
      ["Qualified teachers", data.staff.qualifiedTeachers],
      ["Teacher:pupil ratio", data.staff.teacherPupilRatio],
      ["Days present", data.attendance.daysPresent],
      ["Days possible", data.attendance.daysPossible],
      ["Attendance rate %", data.attendance.rate],
    ]);
    XLSX.utils.book_append_sheet(wb, staffSheet, "Staff & Attendance");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const { data: school } = await ctx.supabase
      .from("schools")
      .select("school_code")
      .eq("id", schoolId)
      .maybeSingle();

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "EMIS_XLSX_EXPORT",
      entity_type: "emis_report",
      entity_id: schoolId,
      new_value: { term_id: term_id ?? null, record_count: data.totals.total },
    });

    await ctx.supabase.from("emis_report_logs").insert({
      school_id: schoolId,
      generated_by: ctx.user.id,
      academic_year_id: academic_year_id ?? null,
      term_id: term_id ?? null,
      report_type: "enrolment",
      record_count: data.totals.total,
    });

    const filename = `EMIS_Report_${school?.school_code ?? "school"}_${data.termName}.xlsx`.replace(/\s+/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
});