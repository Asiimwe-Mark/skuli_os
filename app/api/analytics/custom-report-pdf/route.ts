import React from "react";
import { route, errorResponse, dbError } from "@/lib/http";
import { renderToBuffer } from "@react-pdf/renderer";
import { CustomReportPDF } from "@/lib/pdf/custom-report";

// --- Field Whitelist ---------------------------------------------------------

interface FieldDef {
  key: string;
  label: string;
  select: string;
  type: "string" | "number" | "date";
}

const SOURCE_FIELDS: Record<string, FieldDef[]> = {
  "students-fees": [
    { key: "student_name", label: "Student Name", select: "students.full_name", type: "string" },
    { key: "admission_number", label: "Admission No.", select: "students.admission_number", type: "string" },
    { key: "class_name", label: "Class", select: "students.current_class.name", type: "string" },
    { key: "gender", label: "Gender", select: "students.gender", type: "string" },
    { key: "parent_phone", label: "Parent Phone", select: "students.parent_phone", type: "string" },
    { key: "total_expected", label: "Total Due", select: "total_expected", type: "number" },
    { key: "total_paid", label: "Total Paid", select: "total_paid", type: "number" },
    { key: "balance", label: "Balance", select: "balance", type: "number" },
    { key: "status", label: "Status", select: "status", type: "string" },
  ],
  academics: [
    { key: "student_name", label: "Student Name", select: "students.full_name", type: "string" },
    { key: "class_name", label: "Class", select: "classes.name", type: "string" },
    { key: "subject_name", label: "Subject", select: "subjects.name", type: "string" },
    { key: "exam_type", label: "Exam Type", select: "exam_type", type: "string" },
    { key: "score", label: "Score", select: "score", type: "number" },
    { key: "max_score", label: "Max Score", select: "max_score", type: "number" },
  ],
  attendance: [
    { key: "student_name", label: "Student Name", select: "students.full_name", type: "string" },
    { key: "admission_number", label: "Admission No.", select: "students.admission_number", type: "string" },
    { key: "class_name", label: "Class", select: "classes.name", type: "string" },
    { key: "date", label: "Date", select: "date", type: "date" },
    { key: "status", label: "Status", select: "status", type: "string" },
    { key: "notes", label: "Notes", select: "notes", type: "string" },
  ],
  payments: [
    { key: "student_name", label: "Student Name", select: "students.full_name", type: "string" },
    { key: "admission_number", label: "Admission No.", select: "students.admission_number", type: "string" },
    { key: "amount", label: "Amount", select: "amount", type: "number" },
    { key: "payment_method", label: "Method", select: "payment_method", type: "string" },
    { key: "payment_date", label: "Date", select: "payment_date", type: "date" },
    { key: "receipt_number", label: "Receipt #", select: "receipt_number", type: "string" },
    { key: "status", label: "Status", select: "status", type: "string" },
  ],
};

const SOURCE_TABLE: Record<string, { table: string; select: string }> = {
  "students-fees": {
    table: "fee_accounts",
    select: "total_expected, total_paid, balance, status, students(full_name, admission_number, gender, parent_phone, current_class:classes(name))",
  },
  academics: {
    table: "marks",
    select: "exam_type, score, max_score, students(full_name), classes(name), subjects(name)",
  },
  attendance: {
    table: "attendance_records",
    select: "date, status, notes, students(full_name, admission_number), classes(name)",
  },
  payments: {
    table: "fee_payments",
    select: "amount, payment_method, payment_date, receipt_number, status, students(full_name, admission_number)",
  },
};

interface ReportConfig {
  source: string;
  columns: string[];
  filters?: { field: string; operator: string; value: string; value2?: string }[];
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

function validateConfig(config: unknown): config is ReportConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Partial<ReportConfig>;
  if (!c.source || !SOURCE_FIELDS[c.source]) return false;
  if (!Array.isArray(c.columns) || c.columns.length === 0) return false;
  const allowedKeys = SOURCE_FIELDS[c.source].map((f) => f.key);
  for (const col of c.columns) {
    if (!allowedKeys.includes(col)) return false;
  }
  return true;
}

// --- Handler -----------------------------------------------------------------

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const configParam = searchParams.get("config");
    if (!configParam) return errorResponse("Missing config parameter", 400);

    let config: ReportConfig;
    try {
      config = JSON.parse(Buffer.from(configParam, "base64").toString("utf-8"));
    } catch {
      return errorResponse("Invalid config encoding", 400);
    }

    if (!validateConfig(config)) {
      return errorResponse("Invalid report configuration", 400);
    }

    // Get school info
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name, address")
      .eq("id", schoolId)
      .single();

    const sourceDef = SOURCE_TABLE[config.source];
    const fieldDefs = SOURCE_FIELDS[config.source];

    // Build select - same logic as CSV route
    const neededJoins = new Set<string>();
    const directCols: string[] = ["id"];
    for (const colKey of config.columns) {
      const field = fieldDefs.find((f) => f.key === colKey);
      if (!field) continue;
      if (field.select.includes(".")) {
        const joinPath = field.select.split(".").slice(0, -1).join(".");
        neededJoins.add(joinPath);
      } else {
        directCols.push(field.select);
      }
    }

    let selectParts = directCols.join(", ");
    for (const join of neededJoins) {
      if (join === "students.current_class") {
        selectParts += ", students(full_name, admission_number, gender, parent_phone, current_class:classes(name))";
      } else if (join === "students") {
        selectParts += ", students(full_name, admission_number)";
      } else if (join === "classes") {
        selectParts += ", classes(name)";
      } else if (join === "subjects") {
        selectParts += ", subjects(name)";
      }
    }

    let query = ctx.supabase
      .from(sourceDef.table as never)
      .select(selectParts)
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const dateField = fieldDefs.find((f) => f.type === "date");
    if (dateField && !dateField.select.includes(".")) {
      if (config.date_from) query = query.gte(dateField.select, config.date_from);
      if (config.date_to) query = query.lte(dateField.select, config.date_to);
    }

    if (config.sort_by) {
      const sortField = fieldDefs.find((f) => f.key === config.sort_by);
      if (sortField && !sortField.select.includes(".")) {
        query = query.order(sortField.select, { ascending: config.sort_dir !== "desc" });
      }
    } else {
      query = query.order("id", { ascending: false });
    }

    query = query.limit(5000);

    const { data, error } = await query;
    if (error) return dbError(error, "Database error");

    // Generate PDF using template from lib/pdf/
    const { Document } = await import("@react-pdf/renderer");
    const buffer = await renderToBuffer(
      React.createElement(Document, null, React.createElement(CustomReportPDF, {
        schoolName: school?.name || "School",
        schoolAddress: school?.address || "",
        source: config.source,
        columns: config.columns,
        dateFrom: config.date_from,
        dateTo: config.date_to,
        data: data || [],
        fieldDefs,
      }))
    );

    // Migration guide §7.3: PDF routes return a binary Response that
    // the wrapper passes through unchanged.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${config.source}-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  },
});
