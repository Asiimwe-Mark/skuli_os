import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { aggregateEmisData } from "@/lib/emis/aggregate";
import { EmisReportPDF } from "@/lib/pdf/emis-report";
import { emisReportSchema } from "@/lib/validations/emis";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const body = await request.json().catch(() => ({}));
    const parsed = emisReportSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { academic_year_id, term_id } = parsed.data;
    const data = await aggregateEmisData(ctx.supabase, schoolId, term_id);

    const { data: school } = await ctx.supabase
      .from("schools")
      .select("logo_url, school_code")
      .eq("id", schoolId)
      .maybeSingle();

    const { Document } = await import("@react-pdf/renderer");
    const buffer = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(EmisReportPDF, {
          data,
          logoUrl: school?.logo_url ?? null,
          reportDate: new Date().toLocaleDateString("en-UG"),
        })
      )
    );

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "EMIS_PDF_EXPORT",
      entity_type: "emis_report",
      entity_id: schoolId,
      new_value: { term_id: term_id ?? null, record_count: data.totals.total },
    });

    // Report log
    await ctx.supabase.from("emis_report_logs").insert({
      school_id: schoolId,
      generated_by: ctx.user.id,
      academic_year_id: academic_year_id ?? null,
      term_id: term_id ?? null,
      report_type: "enrolment",
      record_count: data.totals.total,
    });

    const filename = `EMIS_Report_${school?.school_code ?? "school"}_${data.termName}.pdf`.replace(/\s+/g, "_");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}
