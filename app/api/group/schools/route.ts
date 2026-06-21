import type { Database } from "@/types/database";
import { z } from "zod";
import { route } from "@/lib/http";

export const GET = route({
  roles: ["GROUP_ADMIN", "SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) throw new Error("No group found for this user");

    const { data: schools, error } = await ctx.supabase
      .from("schools")
      .select(
        "id, name, district, email, phone, subscription_plan, subscription_status, created_at",
      )
      .eq("group_id", groupAdmin.group_id)
      .eq("is_deleted", false)
      .order("name");

    if (error) throw new Error("Database error");

    const enriched: Array<
      Record<string, unknown> & { student_count: number; fee_collected: number }
    > = [];
    for (const school of schools ?? []) {
      const { count: studentCount } = await ctx.supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .eq("status", "active");

      const { data: payments } = await ctx.supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", school.id)
        .eq("status", "confirmed");

      const totalFees = (payments ?? []).reduce(
        (sum: number, p: { amount?: number }) => sum + (p.amount ?? 0),
        0,
      );

      enriched.push({
        ...(school as Record<string, unknown>),
        student_count: studentCount ?? 0,
        fee_collected: totalFees,
      });
    }

    const totals = {
      schools: enriched.length,
      students: enriched.reduce((s, e) => s + e.student_count, 0),
      fees: enriched.reduce((s, e) => s + e.fee_collected, 0),
    };

    return { schools: enriched, totals };
  },
});

const createSchoolSchema = z.object({
  name: z.string().min(1),
  district: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  subscription_plan: z.enum(["starter", "growth", "pro"]).optional(),
});

export const POST = route({
  roles: ["GROUP_ADMIN", "SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: createSchoolSchema,
  handler: async (ctx, body) => {
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) throw new Error("No group found");

    const { data: school, error } = await ctx.supabase
      .from("schools")
      .insert({
        name: body.name,
        district: body.district ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        subscription_plan: body.subscription_plan ?? "starter",
        group_id: groupAdmin.group_id,
        school_type: "both",
        school_code: `SCH${Date.now()}`,
        subscription_status: "trial",
        max_students: 100,
      } as unknown as Database["public"]["Tables"]["schools"]["Insert"])
      .select()
      .single();

    if (error) throw new Error("Database error");
    return school;
  },
});