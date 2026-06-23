import { route, AuthError } from "@/lib/http";
import { importTemplateSchema } from "@/lib/validations/marketplace";

// §10.3: hard caps so a marketplace import cannot inject arbitrarily
// long SMS messages or thousands of fee line items. The fee_structures
// table has no per-row size cap, so the import route is the only
// chokepoint.
const MAX_SMS_BODY_LENGTH = 1600;
const MAX_FEE_IMPORT_ITEMS = 200;
const MAX_FEE_ITEM_NAME_LENGTH = 120;
const MAX_FEE_ITEM_AMOUNT = 50_000_000;

function sanitizeSmsBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Strip ASCII control characters; truncate. Newlines are kept
  // because SMS templates intentionally use them.
  return raw.replace(/[\x00-\x1F]/g, "").slice(0, MAX_SMS_BODY_LENGTH);
}

function validateFeeItems(
  raw: unknown,
):
  | { ok: true; rows: Array<{ name: string; amount: number; is_mandatory: boolean }> }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Template body is malformed: items[] missing" };
  }
  if (raw.length === 0) {
    return { ok: false, error: "Template has no fee items" };
  }
  if (raw.length > MAX_FEE_IMPORT_ITEMS) {
    return {
      ok: false,
      error: `Template has ${raw.length} items; max is ${MAX_FEE_IMPORT_ITEMS}`,
    };
  }
  const rows: Array<{ name: string; amount: number; is_mandatory: boolean }> = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") {
      return { ok: false, error: "Template contains a non-object item" };
    }
    const candidate = it as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (name.length === 0) {
      return { ok: false, error: "Every fee item needs a non-empty name" };
    }
    if (name.length > MAX_FEE_ITEM_NAME_LENGTH) {
      return {
        ok: false,
        error: `Fee item name longer than ${MAX_FEE_ITEM_NAME_LENGTH} chars`,
      };
    }
    const amount = Number(candidate.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_FEE_ITEM_AMOUNT) {
      return {
        ok: false,
        error: `Fee amount must be between 0 and ${MAX_FEE_ITEM_AMOUNT} UGX`,
      };
    }
    rows.push({
      name,
      amount,
      is_mandatory: Boolean(candidate.is_mandatory),
    });
  }
  return { ok: true, rows };
}

interface SmsBody {
  text: string;
}
interface FeeItem {
  name: string;
  is_mandatory: boolean;
  amount: number;
}
interface FeeBody {
  items: FeeItem[];
}

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: importTemplateSchema,
  handler: async (ctx, body, _request, params) => {
    const schoolId = ctx.schoolId!;
    const { id } = (params ?? {}) as { id: string };

    const { data: template, error: tErr } = await ctx.supabase
      .from("marketplace_templates")
      .select("id, category, name, body, variables")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (tErr || !template) {
      throw new AuthError("Template not found", 404);
    }

    let createdCount = 0;

    if (body.target === "sms_template" || body.target === "report_comment") {
      const tbody = template.body as unknown as SmsBody;
      const safeText = sanitizeSmsBody(tbody?.text);
      if (safeText.length === 0) {
        throw new AuthError("Template body is empty", 400);
      }
      const { error } = await ctx.supabase.from("sms_templates").insert({
        school_id: schoolId,
        name: `${template.name} (from Marketplace)`,
        body: safeText,
        variables: template.variables ?? [],
        is_default: false,
      });
      if (error) throw new AuthError("Failed to import template", 500);
      createdCount = 1;
    } else if (body.target === "fee_structure") {
      if (!body.class_id || !body.term_id) {
        throw new AuthError(
          "class_id and term_id are required for fee structures",
          400,
        );
      }
      const fbody = template.body as unknown as FeeBody;
      const validation = validateFeeItems(fbody?.items);
      if (!validation.ok) {
        throw new AuthError(validation.error, 400);
      }
      const rows = validation.rows.map((it) => ({
        school_id: schoolId,
        class_id: body.class_id!,
        term_id: body.term_id!,
        name: it.name,
        amount: it.amount,
      }));
      if (rows.length > 0) {
        const { error } = await ctx.supabase
          .from("fee_structures")
          .insert(rows);
        if (error) throw new AuthError("Failed to import fee structure", 500);
      }
      createdCount = rows.length;
    }

    await ctx.supabase
      .from("marketplace_templates")
      .update({
        use_count:
          ((template as { use_count?: number }).use_count ?? 0) + 1,
      })
      .eq("id", id);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "MARKETPLACE_IMPORT",
      entity_type: "marketplace_template",
      entity_id: id,
      new_value: { target: body.target, created: createdCount },
    });

    return { imported: createdCount };
  },
});