import crypto from "crypto";
import { staffSchema } from "@/lib/validations/staff";
import { route, dbError, paginatedResponse } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("is_active");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    let query = ctx.supabase
      .from("staff")
      .select(
        "id, school_id, user_id, employee_number, photo_url, full_name, role_title, hire_date, is_active, created_at, updated_at",
        { count: "exact" },
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    }
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,employee_number.ilike.%${search}%,role_title.ilike.%${search}%`,
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return dbError(error, "Database error");

    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: staffSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const uniqueSuffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const employeeNumber = `EMP-${uniqueSuffix}`;

    const { data: staff, error } = (await ctx.supabase
      .from("staff")
      .insert({
        school_id: schoolId,
        user_id: null,
        employee_number: employeeNumber,
        full_name: body.full_name,
        role_title: body.role_title,
        national_id: body.national_id ?? null,
        bank_name: body.bank_name ?? null,
        bank_account: body.bank_account ?? null,
        nssf_number: body.nssf_number ?? null,
        basic_salary: body.basic_salary,
        hire_date: body.hire_date,
        is_active: body.is_active,
      })
      .select()
      .single()) as { data: { id: string } | null; error: unknown };

    if (error) return dbError(error, "Database error", 400);

    await writeAuditLog(ctx.supabase, {
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_created",
      entity_type: "staff",
      entity_id: staff?.id ?? null,
      new_value: {
        name: body.full_name,
        role: body.role_title,
        employee_number: employeeNumber,
      },
    });

    return staff;
  },
});