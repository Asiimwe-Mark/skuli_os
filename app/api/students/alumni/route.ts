import { z } from "zod";
import { route, errorResponse, dbError, paginatedResponse, respond } from "@/lib/http";

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
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const year = searchParams.get("year");
    const className = searchParams.get("class");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("alumni")
      .select("*", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
      );
    }
    if (year) query = query.eq("graduation_year", parseInt(year, 10));
    if (className) query = query.eq("last_class", className);

    const { data, error, count } = await query
      .order("graduation_year", { ascending: false })
      .order("last_name", { ascending: true })
      .range(from, to);

    if (error) return dbError(error, "Database error");

    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: createAlumniSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data, error } = await ctx.supabase
      .from("alumni")
      .insert({
        school_id: schoolId,
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
      })
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_create",
      entity_type: "alumni",
      entity_id: data.id,
      old_value: null,
      new_value: { first_name: data.first_name, last_name: data.last_name },
      ip_address: null,
    });

    return respond.status(201, data);
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN"],
  schema: updateAlumniSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { id, ...updates } = body;

    // Verify ownership
    const { data: existing } = await ctx.supabase
      .from("alumni")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) return errorResponse("Alumni record not found", 404);

    const { data, error } = await ctx.supabase
      .from("alumni")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_update",
      entity_type: "alumni",
      entity_id: id,
      old_value: null,
      new_value: updates,
      ip_address: null,
    });

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Missing id parameter", 400);

    // Verify ownership
    const { data: existing } = await ctx.supabase
      .from("alumni")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) return errorResponse("Alumni record not found", 404);

    const { error } = await ctx.supabase
      .from("alumni")
      .update({ is_deleted: true })
      .eq("id", id);

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_delete",
      entity_type: "alumni",
      entity_id: id,
      old_value: null,
      new_value: null,
      ip_address: null,
    });

    return { deleted: true };
  },
});
