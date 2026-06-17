import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
type PayrollRecordRow = Database["public"]["Tables"]["payroll_records"]["Row"];

type StaffWithPayroll = StaffRow & {
  payroll_records: Pick<PayrollRecordRow, "id" | "month" | "year" | "basic_salary" | "net_salary" | "nssf_employee" | "nssf_employer" | "payment_status" | "paid_at">[];
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);
    const { id } = await params;

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .select(`
        *,
        payroll_records(id, month, year, basic_salary, net_salary, nssf_employee, nssf_employer, payment_status, paid_at)
      `)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (error || !staff) {
      return errorResponse("Staff member not found", 404);
    }

    return successResponse(staff);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from("staff")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: Record<string, any> | null };

    if (!existing) {
      return errorResponse("Staff member not found", 404);
    }

    const body = await request.json();

    const allowedFields: Record<string, unknown> = {};
    if (body.full_name !== undefined) allowedFields.full_name = body.full_name;
    if (body.role_title !== undefined) allowedFields.role_title = body.role_title;
    if (body.national_id !== undefined) allowedFields.national_id = body.national_id;
    if (body.bank_name !== undefined) allowedFields.bank_name = body.bank_name;
    if (body.bank_account !== undefined) allowedFields.bank_account = body.bank_account;
    if (body.nssf_number !== undefined) allowedFields.nssf_number = body.nssf_number;
    if (body.basic_salary !== undefined) {
      if (typeof body.basic_salary !== "number" || body.basic_salary <= 0) {
        return errorResponse("Salary must be a positive number", 400);
      }
      allowedFields.basic_salary = body.basic_salary;
    }
    if (body.hire_date !== undefined) allowedFields.hire_date = body.hire_date;
    if (body.is_active !== undefined) allowedFields.is_active = body.is_active;

    if (Object.keys(allowedFields).length === 0) {
      return errorResponse("No valid fields to update", 400);
    }

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .update(allowedFields as unknown as Database["public"]["Tables"]["staff"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_updated",
      entity_type: "staff",
      entity_id: id,
      old_value: { name: existing.full_name, role: existing.role_title },
      new_value: allowedFields,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse(staff);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from("staff")
      .select("id, full_name, employee_number")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: { id: string; full_name: string; employee_number: string } | null };

    if (!existing) {
      return errorResponse("Staff member not found", 404);
    }

    // Soft delete and deactivate
    const { error } = await ctx.supabase
      .from("staff")
      .update({ is_deleted: true, is_active: false })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_deleted",
      entity_type: "staff",
      entity_id: id,
      old_value: { name: existing.full_name, employee_number: existing.employee_number },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}
