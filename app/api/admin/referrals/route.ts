import { route } from "@/lib/http";

// GET: SUPER_ADMIN only. All referral codes with owner school name,
// total referral count and total credited months.
export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const { data: codes, error } = await ctx.supabase
      .from("referral_codes")
      .select("id, code, owner_school_id, is_active, created_at, schools:owner_school_id(name)");

    if (error) throw new Error("Failed to load referrals");

    const codeIds = (codes ?? []).map((c) => c.id);
    const ownerIds = (codes ?? []).map((c) => c.owner_school_id);

    const { data: referrals } = codeIds.length
      ? await ctx.supabase
          .from("referrals")
          .select("referral_code_id, credit_months, rewarded_at")
          .in("referral_code_id", codeIds)
      : { data: [] };

    const { data: credits } = ownerIds.length
      ? await ctx.supabase
          .from("billing_credits")
          .select("school_id, months")
          .in("school_id", ownerIds)
      : { data: [] };

    const creditsBySchool: Record<string, number> = {};
    for (const c of credits ?? []) creditsBySchool[c.school_id] = c.months;

    const rows = (codes ?? []).map((c) => {
      const own = (referrals ?? []).filter((r) => r.referral_code_id === c.id);
      const school = c.schools as unknown as { name: string } | null;
      return {
        id: c.id,
        code: c.code,
        schoolName: school?.name ?? "School",
        isActive: c.is_active,
        totalReferrals: own.length,
        creditedMonths: creditsBySchool[c.owner_school_id] ?? 0,
      };
    });

    rows.sort((a, b) => b.totalReferrals - a.totalReferrals);
    return { referrals: rows };
  },
});