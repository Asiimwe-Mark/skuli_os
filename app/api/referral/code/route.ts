import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

// GET: return the calling school's referral code and stats.
export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "GROUP_ADMIN", "SUPER_ADMIN"]);

    const { data: code } = await ctx.supabase
      .from("referral_codes")
      .select("id, code, is_active, created_at")
      .eq("owner_school_id", schoolId)
      .maybeSingle();

    if (!code) {
      return successResponse({
        code: null,
        totalReferrals: 0,
        creditedMonths: 0,
        pendingReferrals: 0,
        referrals: [],
      });
    }

    const { data: referrals } = await ctx.supabase
      .from("referrals")
      .select("id, referred_school_id, rewarded_at, credit_months, created_at")
      .eq("referral_code_id", code.id)
      .order("created_at", { ascending: false });

    const { data: credits } = await ctx.supabase
      .from("billing_credits")
      .select("months")
      .eq("school_id", schoolId)
      .maybeSingle();

    const list = referrals ?? [];
    const pending = list.filter((r) => !r.rewarded_at).length;

    // Resolve referred school names (best-effort).
    const schoolIds = list.map((r) => r.referred_school_id);
    const namesById: Record<string, string> = {};
    if (schoolIds.length > 0) {
      const { data: schools } = await ctx.supabase
        .from("schools")
        .select("id, name")
        .in("id", schoolIds);
      for (const s of schools ?? []) namesById[s.id] = s.name;
    }

    return successResponse({
      code: code.code,
      isActive: code.is_active,
      totalReferrals: list.length,
      creditedMonths: credits?.months ?? 0,
      pendingReferrals: pending,
      referrals: list.map((r) => ({
        id: r.id,
        schoolName: namesById[r.referred_school_id] ?? "School",
        signupDate: r.created_at,
        status: r.rewarded_at ? "credited" : "pending",
      })),
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}
