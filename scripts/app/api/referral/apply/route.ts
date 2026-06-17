import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyReferralSchema } from "@/lib/validations/referral";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

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
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = applyReferralSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Re-validate that the new_school_id actually exists. Defence in
    // depth — the admin RPC could happily write to a phantom id and
    // we don't want a SUPER_ADMIN's stale browser tab to credit
    // nothing.
    const admin = createAdminClient();
    const { data: school, error: schoolError } = await admin
      .from("schools")
      .select("id")
      .eq("id", parsed.data.new_school_id)
      .maybeSingle();
    if (schoolError) {
      console.error("[referral/apply] school lookup error:", schoolError);
      return errorResponse("Referral could not be applied", 500);
    }
    if (!school) {
      return errorResponse("Target school does not exist", 404);
    }

    const { data, error } = await admin.rpc("apply_referral_credit", {
      p_code: parsed.data.referral_code,
      p_new_school_id: parsed.data.new_school_id,
    });

    if (error) {
      console.error("[referral/apply] rpc error:", error.message);
      return errorResponse("Referral could not be applied", 400);
    }

    // Audit trail — record who triggered the re-apply and what they did.
    await admin.from("audit_logs").insert({
      school_id: parsed.data.new_school_id,
      user_id: ctx.user.id,
      action: "REFERRAL_APPLIED",
      entity_type: "school",
      entity_id: parsed.data.new_school_id,
      new_value: { referral_code: parsed.data.referral_code },
      old_value: null,
      ip_address: null,
    });

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : 500;
    if (status === 401) return errorResponse("Unauthorized", 401);
    if (status === 403) return errorResponse("Insufficient permissions", 403);
    console.error("[referral/apply] error:", err);
    return errorResponse(message, status);
  }
}
