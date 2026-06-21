import { z } from "zod";
import { route } from "@/lib/http";
import type { AuthContext } from "@/lib/http";
import { sanitizePhoneForPayment } from "@/lib/utils/phone";

const patchSchema = z.object({
  preferred_method: z.enum(["MOBILE_MONEY", "BANK"]),
  mobile_number: z.string().max(20).optional().nullable(),
  bank_code: z.string().max(50).optional().nullable(),
  bank_name: z.string().max(100).optional().nullable(),
  account_number: z.string().max(30).optional().nullable(),
});

/**
 * Audit 3.22: this route does not restrict roles at the wrapper
 * level — the authorization model is more nuanced than a simple
 * allow-list:
 *   - SCHOOL_ADMIN, BURSAR, SUPER_ADMIN can manage any staff profile
 *   - A staff member can manage their own profile (when their user
 *     row links to the staff row via `staff.user_id`)
 *
 * `canManage` encodes that. The route still requires a school_id
 * (this is a school-scoped resource) and the staff row must belong
 * to the caller's school.
 */
async function canManage(
  ctx: AuthContext,
  staffId: string,
  schoolId: string,
): Promise<boolean> {
  if (["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"].includes(ctx.profile.role)) {
    return true;
  }
  const { data } = await ctx.supabase
    .from("staff")
    .select("user_id")
    .eq("id", staffId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return (data as { user_id: string | null } | null)?.user_id === ctx.user.id;
}

export const GET = route({
  roles: [],
  handler: async (ctx, _request, params) => {
    const { id } = params as { id: string };
    const schoolId = ctx.profile.school_id!;
    if (!(await canManage(ctx, id, schoolId))) {
      throw new Error("Forbidden");
    }

    const { data } = await ctx.supabase
      .from("staff_payment_profiles")
      .select(
        "id, staff_id, preferred_method, mobile_number, bank_code, bank_name, account_number, updated_at",
      )
      .eq("staff_id", id)
      .eq("school_id", schoolId)
      .maybeSingle();

    return data ?? null;
  },
});

export const PATCH = route({
  roles: [],
  schema: patchSchema,
  handler: async (ctx, body, _request, params) => {
    const { id } = params as { id: string };
    const schoolId = ctx.profile.school_id!;
    if (!(await canManage(ctx, id, schoolId))) {
      throw new Error("Forbidden");
    }

    if (body.preferred_method === "MOBILE_MONEY") {
      if (!body.mobile_number) {
        throw new Error("Mobile number is required for Mobile Money");
      }
      try {
        sanitizePhoneForPayment(body.mobile_number);
      } catch (e) {
        throw new Error((e as Error).message);
      }
    } else if (body.preferred_method === "BANK") {
      if (!body.bank_code || !body.account_number) {
        throw new Error(
          "Bank code and account number are required for Bank payouts",
        );
      }
    }

    const { data, error } = await ctx.supabase
      .from("staff_payment_profiles")
      .upsert(
        {
          school_id: schoolId,
          staff_id: id,
          preferred_method: body.preferred_method,
          mobile_number: body.mobile_number || null,
          bank_code: body.bank_code || null,
          bank_name: body.bank_name || null,
          account_number: body.account_number || null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "staff_id" },
      )
      .select()
      .single();

    if (error) {
      throw new Error(
        "Failed to save payment profile. Please check the details and try again.",
      );
    }
    return data;
  },
});