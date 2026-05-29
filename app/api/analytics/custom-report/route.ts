import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";

// ─── Field Whitelist ─────────────────────────────────────────────────────────
// Each source defines allowed fields with their Supabase select path and label.

interface FieldDef {
  key: string;
  label: string;
  select: string; // Supabase select column or join path
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

// Table + base select per source
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

// ─── Config Schema ───────────────────────────────────────────────────────────

interface ReportConfig {
  source: string;
  columns: string[]; // field keys
  filters?: {
    field: string;
    operator: "equals" | "contains" | "greater_than" | "less_than" | "between";
    value: string;
    value2?: string; // for "between"
  }[];
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

function validateConfig(config: any): config is ReportConfig {
  if (!config || typeof config !== "object") return false;
  if (!SOURCE_FIELDS[config.source]) return false;
  if (!Array.isArray(config.columns) || config.columns.length === 0) return false;

  const allowedKeys = SOURCE_FIELDS[config.source].map((f) => f.key);
  for (const col of config.columns) {
    if (!allowedKeys.includes(col)) return false;
  }
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function applyFilters(query: any, filters: ReportConfig["filters"], fieldDefs: FieldDef[]) {
  if (!filters || filters.length === 0) return query;

  for (const filter of filters) {
    const fieldDef = fieldDefs.find((f) => f.key === filter.field);
    if (!fieldDef) continue;

    // For joined fields, we can only filter on direct columns
    const isDirect = !fieldDef.select.includes(".");
    if (!isDirect) continue;

    const col = fieldDef.select;
    switch (filter.operator) {
      case "equals":
        query = query.eq(col, filter.value);
        break;
      case "contains":
        query = query.ilike(col, `%${filter.value}%`);
        break;
      case "greater_than":
        query = query.gt(col, filter.value);
        break;
      case "less_than":
        query = query.lt(col, filter.value);
        break;
      case "between":
        if (filter.value) query = query.gte(col, filter.value);
        if (filter.value2) query = query.lte(col, filter.value2);
        break;
    }
  }
  return query;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

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

    const sourceDef = SOURCE_TABLE[config.source];
    const fieldDefs = SOURCE_FIELDS[config.source];

    // Build select string — only include joins needed for selected columns
    const neededJoins = new Set<string>();
    const directCols: string[] = ["id"]; // always include id
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

    // Build Supabase select string
    let selectParts = directCols.join(", ");
    for (const join of neededJoins) {
      // Map join path to Supabase join syntax
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
      .from(sourceDef.table)
      .select(selectParts)
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    // Apply date range
    const dateField = fieldDefs.find((f) => f.type === "date");
    if (dateField && dateField.select.includes(".") === false) {
      if (config.date_from) query = query.gte(dateField.select, config.date_from);
      if (config.date_to) query = query.lte(dateField.select, config.date_to);
    }

    // Apply filters
    query = applyFilters(query, config.filters, fieldDefs);

    // Apply sort
    if (config.sort_by) {
      const sortField = fieldDefs.find((f) => f.key === config.sort_by);
      if (sortField && !sortField.select.includes(".")) {
        query = query.order(sortField.select, { ascending: config.sort_dir !== "desc" });
      }
    } else {
      query = query.order("id", { ascending: false });
    }

    // Limit to prevent memory issues
    query = query.limit(10000);

    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);

    // Build CSV
    const selectedFieldDefs = config.columns.map((k) => fieldDefs.find((f) => f.key === k)).filter(Boolean) as FieldDef[];
    const headers = selectedFieldDefs.map((f) => f.label);

    const rows = (data || []).map((row: any) =>
      selectedFieldDefs.map((field) => {
        let value: any;
        if (field.select.includes(".")) {
          value = getNestedValue(row, field.select);
        } else {
          value = row[field.select];
        }
        if (value === null || value === undefined) return "";
        return String(value);
      })
    );

    const csv = [headers, ...rows]
      .map((row) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="report-${config.source}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
