import { route, AuthError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyReferralSchema } from "@/lib/validations/referral";

// SECURITY (audit H-1): this route used to accept an unauthenticated POST
// and call `apply_referral_credit` via the admin client — which bypasses
// every RLS policy. An attacker who knew any school_id UUID and referral
// code could fraudulently credit any school.
//
// The normal onboarding path now inlines the RPC in
// `/app/api/onboard/route.ts` (server-side, with rate limiting and after
// the school has just been created), so this HTTP route is only needed
// for back-office re-attribution by a platform super admin. Lock it down
// to SUPER_ADMIN only.
export const POST = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: applyReferralSchema,
  handler: async (ctx, body) => {
    const admin = createAdminClient();
    const { data: school, error: schoolError } = await admin
      .from("schools")
      .select("id")
      .eq("id", body.new_school_id)
      .maybeSingle();
    if (schoolError) {
      console.error("[referral/apply] school lookup error:", schoolError);
      throw new AuthError("Referral could not be applied", 500);
    }
    if (!school) {
      throw new AuthError("Target school does not exist", 404);
    }

    const { data, error } = await admin.rpc("apply_referral_credit", {
      p_code: body.referral_code,
      p_new_school_id: body.new_school_id,
    });

    if (error) {
      console.error("[referral/apply] rpc error:", error.message);
      throw new AuthError("Referral could not be applied", 400);
    }

    await admin.from("audit_logs").insert({
      school_id: body.new_school_id,
      user_id: ctx.user.id,
      action: "REFERRAL_APPLIED",
      entity_type: "school",
      entity_id: body.new_school_id,
      new_value: { referral_code: body.referral_code },
      old_value: null,
      ip_address: null,
    });

    return data;
  },
});