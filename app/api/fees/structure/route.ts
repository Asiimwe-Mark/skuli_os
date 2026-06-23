import { createFeeStructureSchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError, respond } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const classId = searchParams.get("class_id");

    let query = ctx.supabase
      .from("fee_structures")
      .select("*, class:classes(id, name)")
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false);

    if (termId) query = query.eq("term_id", termId);
    if (classId) {
      query = query.or(`class_id.is.null,class_id.eq.${classId}`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");

    return { items: data ?? [] };
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createFeeStructureSchema,
  handler: async (ctx, body) => {
    const { data: term } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("id", body.term_id)
      .eq("school_id", ctx.schoolId)
      .maybeSingle() as { data: { id: string } | null };

    if (!term) {
      return errorResponse("Invalid term for this school", 400);
    }

    if (body.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", body.class_id)
        .eq("school_id", ctx.schoolId)
        .maybeSingle() as { data: { id: string } | null };

      if (!cls) {
        return errorResponse("Invalid class for this school", 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .insert({
        school_id: ctx.schoolId,
        term_id: body.term_id,
        class_id: body.class_id ?? null,
        name: body.name,
        amount: body.amount,
        is_mandatory: body.is_mandatory,
      } as never)
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_created",
      entity_type: "fee_structure",
      entity_id: data?.id ?? null,
      new_value: { name: body.name, amount: body.amount },
    });

    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: ctx.schoolId,
      fee_structure_id: data?.id,
      changed_by: ctx.user.id,
      action: "created",
      old_value: null,
      new_value: { name: body.name, amount: body.amount, is_mandatory: body.is_mandatory, class_id: body.class_id ?? null },
    } as never);

    void invalidateSchoolAsync(ctx.schoolId);

    return respond.status(201, data);
  },
});