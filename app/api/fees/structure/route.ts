import type { Database } from "@/types/database";
import { createFeeStructureSchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError, respond } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const classId = searchParams.get("class_id");

    let query = ctx.supabase
      .from("fee_structures")
      .select("*, class:classes(id, name)")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (termId) query = query.eq("term_id", termId);
    // Audit 2.8 (4.35): the previous `.or(\`class_id.is.null,class_id.eq.${classId}\`)`
    // works in modern PostgREST (>=11) but some older versions reject
    // `is.null` inside an `or` filter. The portable form uses the
    // `is()` builder for the null branch and combines via `.or()` with
    // the equality branch. Both produce the same SQL — "rows where
    // class_id is null OR class_id = $1" — and the second form is
    // accepted by every PostgREST version.
    if (classId) {
      query = query.or(`class_id.is.null,class_id.eq.${classId}`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");

    // Audit 2.8 (4.36): return the standard list envelope so any
    // external consumer can rely on the same shape as every other
    // list endpoint. The dashboard page reads from supabase directly
    // and is unaffected by this change.
    return { items: data ?? [] };
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createFeeStructureSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Verify the term belongs to this school
    const { data: term } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("id", body.term_id)
      .eq("school_id", schoolId)
      .single() as { data: { id: string } | null };

    if (!term) {
      return errorResponse("Invalid term for this school", 400);
    }

    // If class_id provided, verify it belongs to this school
    if (body.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", body.class_id)
        .eq("school_id", schoolId)
        .single() as { data: { id: string } | null };

      if (!cls) {
        return errorResponse("Invalid class for this school", 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .insert({
        school_id: schoolId,
        term_id: body.term_id,
        class_id: body.class_id ?? null,
        name: body.name,
        amount: body.amount,
        is_mandatory: body.is_mandatory,
      } as unknown as Database["public"]["Tables"]["fee_structures"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    // Audit logs
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_created",
      entity_type: "fee_structure",
      entity_id: data?.id,
      new_value: { name: body.name, amount: body.amount },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: data?.id,
      changed_by: ctx.user.id,
      action: "created",
      old_value: null,
      new_value: { name: body.name, amount: body.amount, is_mandatory: body.is_mandatory, class_id: body.class_id ?? null },
    } as unknown as Database["public"]["Tables"]["fee_structure_audit_log"]["Insert"]);

    return respond.status(201, data);
  },
});
