import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { importTemplateSchema } from "@/lib/validations/marketplace";

interface SmsBody { text: string }
interface FeeItem { name: string; is_mandatory: boolean; amount: number }
interface FeeBody { items: FeeItem[] }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = importTemplateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { data: template, error: tErr } = await ctx.supabase
      .from("marketplace_templates")
      .select("id, category, name, body, variables")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (tErr || !template) return errorResponse("Template not found", 404);

    let createdCount = 0;

    if (parsed.data.target === "sms_template" || parsed.data.target === "report_comment") {
      const tbody = template.body as unknown as SmsBody;
      const { error } = await ctx.supabase.from("sms_templates").insert({
        school_id: schoolId,
        name: `${template.name} (from Marketplace)`,
        body: tbody.text ?? "",
        variables: template.variables ?? [],
        is_default: false,
      });
      if (error) return errorResponse("Failed to import template", 500);
      createdCount = 1;
    } else if (parsed.data.target === "fee_structure") {
      if (!parsed.data.class_id || !parsed.data.term_id) {
        return errorResponse("class_id and term_id are required for fee structures", 400);
      }
      const fbody = template.body as unknown as FeeBody;
      const items = fbody.items ?? [];
      const rows = items.map((it) => ({
        school_id: schoolId,
        class_id: parsed.data.class_id!,
        term_id: parsed.data.term_id!,
        name: it.name,
        amount: it.amount,
        is_mandatory: it.is_mandatory,
      }));
      if (rows.length > 0) {
        const { error } = await ctx.supabase.from("fee_structures").insert(rows);
        if (error) return errorResponse("Failed to import fee structure", 500);
      }
      createdCount = rows.length;
    }

    // Increment use_count
    await ctx.supabase
      .from("marketplace_templates")
      .update({ use_count: ((template as { use_count?: number }).use_count ?? 0) + 1 })
      .eq("id", id);
    // Use an RPC-free increment fallback handled above; also try a precise increment.

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "MARKETPLACE_IMPORT",
      entity_type: "marketplace_template",
      entity_id: id,
      new_value: { target: parsed.data.target, created: createdCount },
    });

    return successResponse({ imported: createdCount });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}
