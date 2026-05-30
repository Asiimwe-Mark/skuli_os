import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  event_date: z.string().min(1),
  end_date: z.string().optional().nullable(),
  event_type: z.string().min(1),
  affects_attendance: z.boolean().optional(),
  class_id: z.string().uuid().optional().nullable(),
  is_public: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM
    const classId = searchParams.get("class_id");

    let query = ctx.supabase
      .from("calendar_events")
      .select("*, class:classes(id, name)")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (month) {
      const startDate = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const endMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const endDate = `${endMonth}-01`;
      query = query.gte("event_date", startDate).lt("event_date", endDate);
    }

    if (classId) {
      query = query.or(`class_id.is.null,class_id.eq.${classId}`);
    }

    const { data, error } = await query.order("event_date", { ascending: true });

    if (error) return errorResponse(error.message);

    return successResponse(data ?? []);
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
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("calendar_events")
      .insert({
        school_id: schoolId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        event_date: parsed.data.event_date,
        end_date: parsed.data.end_date ?? null,
        event_type: parsed.data.event_type,
        affects_attendance: parsed.data.affects_attendance ?? false,
        class_id: parsed.data.class_id ?? null,
        is_public: parsed.data.is_public ?? true,
        created_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 400);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "calendar_event_created",
      entity_type: "calendar_event",
      entity_id: (data as any)?.id,
      new_value: { title: parsed.data.title },
    } as any);

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
    const { id, ...updates } = body;

    if (!id) return errorResponse("Event ID is required", 400);

    const parsed = eventSchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Verify ownership
    const { data: existing } = await ctx.supabase
      .from("calendar_events")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (!existing) return errorResponse("Event not found", 404);

    const { data, error } = await ctx.supabase
      .from("calendar_events")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error) return errorResponse(error.message);

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

    if (!id) return errorResponse("Event ID is required", 400);

    const { error } = await ctx.supabase
      .from("calendar_events")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "calendar_event_deleted",
      entity_type: "calendar_event",
      entity_id: id,
    } as any);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
