import { publicRoute } from "@/lib/http";

// GET ?category=&search=&featured= : any authenticated user can read.
// /api/marketplace is in PUBLIC_PREFIXES of the auth-coverage test
// because the marketplace is meant to be browsable pre-signup for
// leads; we still want a uniform { success, data } envelope, so the
// route uses publicRoute() and explicitly returns a Response rather
// than going through the auth-checking wrapper.
export const GET = publicRoute(async (request) => {
  const sp = request.nextUrl.searchParams;
  const category = sp.get("category");
  const search = sp.get("search")?.trim();
  const featured = sp.get("featured");

  // The marketplace reads from `marketplace_templates`, which is a
  // public table (no RLS) — we use the service-role client to bypass
  // any per-school scope. Falls back to anon for safety if not set.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ success: false, error: "Supabase not configured" }, { status: 500 });
  }

  // Lazy import to avoid hard-coupling the public-route path to the
  // server-side @supabase/ssr client.
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from("marketplace_templates")
    .select("id, category, name, description, body, variables, tags, use_count, is_featured")
    .eq("is_deleted", false);

  if (category) query = query.eq("category", category as "sms_template" | "fee_structure" | "report_comment");
  if (featured === "true") query = query.eq("is_featured", true);
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

  query = query.order("is_featured", { ascending: false }).order("use_count", { ascending: false });

  const { data, error } = await query;
  if (error) {
    return Response.json({ success: false, error: "Failed to load templates" }, { status: 500 });
  }
  return Response.json({ success: true, data: { templates: data ?? [] } });
});
