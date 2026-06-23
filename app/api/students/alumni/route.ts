import { z } from "zod";
import { route, errorResponse, dbError, respond } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { scopedQuery, paginated } from "@/lib/http/scoped";

const createAlumniSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  graduation_year: z.number().int().min(2000).max(2100),
  last_class: z.string().optional().nullable(),
  admission_number: z.string().optional().nullable(),
  current_school: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  profession: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  student_id: z.string().uuid().optional().nullable(),
});

const updateAlumniSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  graduation_year: z.number().int().min(2000).max(2100).optional(),
  last_class: z.string().optional().nullable(),
  admission_number: z.string().optional().nullable(),
  current_school: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  profession: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const year = url.searchParams.get("year");
    const className = url.searchParams.get("class");
    const { page, limit, from, to } = paginated.parse(request);

    let query = scopedQuery(ctx, "alumni")
      .select("*", { count: "exact" })
      .eq("is_deleted", false);

    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
      );
    }
    if (year) query = query.eq("graduation_year", parseInt(year, 10));
    if (className) query = query.eq("last_class", className);

    const { data, count, error } = await query
      .order("graduation_year", { ascending: false })
      .order("last_name", { ascending: true })
      .range(from, to);

    if (error) return dbError(error, "Database error");

    return paginated.envelope(data ?? [], count ?? 0, page, limit);
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: createAlumniSchema,
  handler: async (ctx, body) => {
    const { data, error } = await scopedQuery(ctx, "alumni")
      .insert({
        first_name: body.first_name,
        last_name: body.last_name,
        graduation_year: body.graduation_year,
        last_class: body.last_class || null,
        admission_number: body.admission_number || null,
        current_school: body.current_school || null,
        phone: body.phone || null,
        email: body.email || null,
        profession: body.profession || null,
        notes: body.notes || null,
        student_id: body.student_id || null,
      } as never)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "alumni_create",
      entity_type: "alumni",
      entity_id: data?.id ?? null,
      old_value: null,
      new_value: { first_name: data?.first_name, last_name: data?.last_name },
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return respond.status(201, data);
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN"],
  schema: updateAlumniSchema,
  handler: async (ctx, body) => {
    const { id, ...updates } = body;

    const { data: existing } = await scopedQuery(ctx, "alumni")
      .select("id")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (!existing) return errorResponse("Alumni record not found", 404);

    const { data, error } = await scopedQuery(ctx, "alumni")
      .update(updates as never)
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "alumni_update",
      entity_type: "alumni",
      entity_id: id,
      old_value: null,
      new_value: updates as Record<string, unknown>,
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Missing id parameter", 400);

    const { data: existing } = await scopedQuery(ctx, "alumni")
      .select("id")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (!existing) return errorResponse("Alumni record not found", 404);

    const { error } = await scopedQuery(ctx, "alumni")
      .update({ is_deleted: true } as never)
      .eq("id", id);

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "alumni_delete",
      entity_type: "alumni",
      entity_id: id,
      old_value: null,
      new_value: null,
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return { deleted: true };
  },
});