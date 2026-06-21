import type { Database } from "@/types/database";
import { z } from "zod";
import { route, AuthError, dbError } from "@/lib/http";

const patchSchema = z.object({
  full_name: z.string().min(1).optional(),
  role_title: z.string().min(1).optional(),
  national_id: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account: z.string().optional(),
  nssf_number: z.string().optional(),
  basic_salary: z.number().positive().optional(),
  hire_date: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = (params ?? {}) as { id: string };

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .select(
        `
        *,
        payroll_records(id, month, year, basic_salary, net_salary, nssf_employee, nssf_employer, payment_status, paid_at)
      `,
      )
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (error || !staff) {
      throw new AuthError("Staff member not found", 404);
    }

    return staff;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: patchSchema,
  handler: async (ctx, body, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = (params ?? {}) as { id: string };

    const { data: existing } = (await ctx.supabase
      .from("staff")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single()) as { data: Record<string, unknown> | null };

    if (!existing) {
      throw new AuthError("Staff member not found", 404);
    }

    if (Object.keys(body).length === 0) {
      throw new AuthError("No valid fields to update", 400);
    }

    const { data: staff, error } = await ctx.supabase
      .from("staff")
      .update(
        body as unknown as Database["public"]["Tables"]["staff"]["Update"],
      )
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_updated",
      entity_type: "staff",
      entity_id: id,
      old_value: {
        name: existing.full_name,
        role: existing.role_title,
      },
      new_value: body as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]["new_value"],
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return staff;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = (params ?? {}) as { id: string };

    const { data: existing } = (await ctx.supabase
      .from("staff")
      .select("id, full_name, employee_number")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single()) as { data: { id: string; full_name: string; employee_number: string } | null };

    if (!existing) {
      throw new AuthError("Staff member not found", 404);
    }

    const { error } = await ctx.supabase
      .from("staff")
      .update({ is_deleted: true, is_active: false })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "staff_deleted",
      entity_type: "staff",
      entity_id: id,
      old_value: {
        name: existing.full_name,
        employee_number: existing.employee_number,
      },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { deleted: true };
  },
});