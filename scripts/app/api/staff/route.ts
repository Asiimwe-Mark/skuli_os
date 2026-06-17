import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { staffSchema } from "@/lib/validations/staff";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit-log";

type StaffRow = Database["public"]["Tables"]["staff"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("is_active");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("staff")
      .select(
        "id, school_id, user_id, employee_number, photo_url, full_name, role_title, hire_date, is_active, created_at, updated_at",
        { count: "exact" }
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    }
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,employee_number.ilike.%${search}%,role_title.ilike.%${search}%`
      );
    }

    // PII/PHI columns (national_id, bank_name, bank_account, nssf_number,
    // basic_salary) are intentionally excluded from the list endpoint.
    // They are returned only by the per-staff detail endpoint, which
    // requires an additional role check (BURSAR/SCHOOL_ADMIN only).
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return dbError(error, "Database error");

    return successResponse({
      staff: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = staffSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Generate employee number (UUID suffix avoids race conditions)
    const uniqueSuffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const employeeNumber = `EMP-${uniqueSuffix}`;

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .insert({
        school_id: schoolId,
        user_id: null,
        employee_number: employeeNumber,
        full_name: parsed.data.full_name,
        role_title: parsed.data.role_title,
        national_id: parsed.data.national_id ?? null,
        bank_name: parsed.data.bank_name ?? null,
        bank_account: parsed.data.bank_account ?? null,
        nssf_number: parsed.data.nssf_number ?? null,
        basic_salary: parsed.data.basic_salary,
        hire_date: parsed.data.hire_date,
        is_active: parsed.data.is_active,
      })
      .select()
      .single() as { data: { id: string } | null; error: any };

    if (error) return dbError(error, "Database error");

    // Audit log
    await writeAuditLog(ctx.supabase, {
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_created",
      entity_type: "staff",
      entity_id: staff?.id ?? null,
      new_value: { name: parsed.data.full_name, role: parsed.data.role_title, employee_number: employeeNumber },
    });

    return successResponse(staff, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}
