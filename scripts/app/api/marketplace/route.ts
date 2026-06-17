import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

// GET ?category=&search=&featured= : any authenticated user can read.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category");
    const search = sp.get("search")?.trim();
    const featured = sp.get("featured");

    let query = ctx.supabase
      .from("marketplace_templates")
      .select("id, category, name, description, body, variables, tags, use_count, is_featured")
      .eq("is_deleted", false);

    if (category) query = query.eq("category", category as "sms_template" | "fee_structure" | "report_comment");
    if (featured === "true") query = query.eq("is_featured", true);
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

    query = query.order("is_featured", { ascending: false }).order("use_count", { ascending: false });

    const { data, error } = await query;
    if (error) return errorResponse("Failed to load templates", 500);
    return successResponse({ templates: data ?? [] });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}
