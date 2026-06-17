import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET ?code=XYZ : public endpoint. Returns whether a referral code is valid
// and the referring school's name. No authentication required.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return Response.json({ valid: false, referrerSchoolName: "" });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("referral_codes")
    .select("owner_school_id, is_active, schools:owner_school_id(name)")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    return Response.json({ valid: false, referrerSchoolName: "" });
  }

  const school = data.schools as unknown as { name: string } | null;
  return Response.json({
    valid: true,
    referrerSchoolName: school?.name ?? "a SKULI school",
  });
}
