import { z } from "zod";
import { route } from "@/lib/http";
import { softDeleteStaff, updateStaff } from "@/lib/services/staff";
import { scopedQuery } from "@/lib/http/scoped";

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
    const id = params?.id as string | undefined;
    if (!id) throw new Error("id is required");

    const { data: staff, error } = await scopedQuery(ctx, "staff")
      .select(
        `
        *,
        payroll_records(id, month, year, basic_salary, net_salary, nssf_employee, nssf_employer, payment_status, paid_at)
      `,
      )
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (error || !staff) {
      throw new Error("Staff member not found");
    }
    return staff;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: patchSchema,
  handler: async (ctx, body, _request, params) => {
    const id = params?.id as string | undefined;
    if (!id) throw new Error("id is required");
    return updateStaff(ctx, id, body);
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const id = params?.id as string | undefined;
    if (!id) throw new Error("id is required");
    return softDeleteStaff(ctx, id);
  },
});