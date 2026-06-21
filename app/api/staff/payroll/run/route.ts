import type { Database } from "@/types/database";
import { payrollRunSchema } from "@/lib/validations/staff";
import { route, AuthError, dbError } from "@/lib/http";

const NSSF_EMPLOYEE_RATE = 0.05;
const NSSF_EMPLOYER_RATE = 0.10;

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: payrollRunSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { month, year } = body;

    const { count: existingCount } = await ctx.supabase
      .from("payroll_records")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("month", month)
      .eq("year", year);

    if (existingCount && existingCount > 0) {
      throw new AuthError(
        `Payroll for ${month}/${year} has already been generated (${existingCount} records). Delete existing records first if you want to regenerate.`,
        400,
      );
    }

    const { data: staffList } = (await ctx.supabase
      .from("staff")
      .select("id, basic_salary, full_name, employee_number")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .eq("is_deleted", false)) as {
      data: { id: string; basic_salary: number }[] | null;
    };

    if (!staffList || staffList.length === 0) {
      throw new AuthError("No active staff found", 400);
    }

    const payrollRecords: Record<string, unknown>[] = [];

    for (const staff of staffList) {
      const gross = staff.basic_salary;
      const nssfEmployee = Math.round(gross * NSSF_EMPLOYEE_RATE);
      const nssfEmployer = Math.round(gross * NSSF_EMPLOYER_RATE);
      const netSalary = gross - nssfEmployee;

      payrollRecords.push({
        school_id: schoolId,
        staff_id: staff.id,
        month,
        year,
        basic_salary: staff.basic_salary,
        allowances: {},
        deductions: {},
        nssf_employee: nssfEmployee,
        nssf_employer: nssfEmployer,
        net_salary: netSalary,
        payment_status: "pending",
      });
    }

    const { data, error } = await ctx.supabase
      .from("payroll_records")
      .insert(
        payrollRecords as unknown as Database["public"]["Tables"]["payroll_records"]["Insert"],
      )
      .select();

    if (error) return dbError(error, "Database error");
    const created = data?.length ?? 0;

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "payroll_generated",
      entity_type: "payroll_record",
      new_value: { month, year, created, staff_count: staffList.length },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { created, month, year };
  },
});