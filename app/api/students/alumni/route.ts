import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

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

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

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

    if (error) return errorResponse(error.message);

    return successResponse({
      alumni: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = createAlumniSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("alumni")
      .insert({
        school_id: schoolId,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        graduation_year: parsed.data.graduation_year,
        last_class: parsed.data.last_class || null,
        admission_number: parsed.data.admission_number || null,
        current_school: parsed.data.current_school || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        profession: parsed.data.profession || null,
        notes: parsed.data.notes || null,
        student_id: parsed.data.student_id || null,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_create",
      entity_type: "alumni",
      entity_id: data.id,
      new_value: { first_name: data.first_name, last_name: data.last_name },
    });

    return successResponse(data, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = updateAlumniSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { id, ...updates } = parsed.data;

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

    if (error) return errorResponse(error.message);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_update",
      entity_type: "alumni",
      entity_id: id,
      new_value: updates,
    });

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

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

    if (error) return errorResponse(error.message);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "alumni_delete",
      entity_type: "alumni",
      entity_id: id,
    });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
