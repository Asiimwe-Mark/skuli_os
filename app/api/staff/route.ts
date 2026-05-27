import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { staffSchema } from "@/lib/validations/staff";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type StaffRow = Database["public"]["Tables"]["staff"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("is_active");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("staff")
      .select("*", { count: "exact" })
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

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      staff: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
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

    // Generate employee number
    const { count } = await ctx.supabase
      .from("staff")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);
    const seq = (count ?? 0) + 1;
    const employeeNumber = `EMP-${String(seq).padStart(4, "0")}`;

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .insert({
        school_id: schoolId,
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

    if (error) return errorResponse(error.message, 400);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_created",
      entity_type: "staff",
      entity_id: staff?.id,
      new_value: { name: parsed.data.full_name, role: parsed.data.role_title, employee_number: employeeNumber },
    } as any);

    return successResponse(staff, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
