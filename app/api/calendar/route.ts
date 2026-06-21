import { z } from "zod";
import type { Database } from "@/types/database";
import { route, respond, withSchoolReadCache, AuthError, dbError } from "@/lib/http";

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

type EventType =
  | "holiday"
  | "exam"
  | "event"
  | "closure"
  | "meeting";

function asEventType(s: string): EventType {
  return s as EventType;
}

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const classId = searchParams.get("class_id");

    const inputShape = `calendar:${month ?? "_"}:${classId ?? "_"}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId, inputShape, revalidateSeconds: 60 },
      async () => {
        let query = ctx.supabase
          .from("calendar_events")
          .select("*, class:classes(id, name)")
          .eq("school_id", schoolId)
          .eq("is_deleted", false);

        if (month) {
          const startDate = `${month}-01`;
          const [y, m] = month.split("-").map(Number);
          const endMonth =
            m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
          const endDate = `${endMonth}-01`;
          query = query.gte("event_date", startDate).lt("event_date", endDate);
        }

        if (classId) {
          query = query.or(`class_id.is.null,class_id.eq.${classId}`);
        }

        const { data, error } = await query.order("event_date", {
          ascending: true,
        });
        if (error) throw error;
        return data ?? [];
      },
    );

    return applyTo(respond.cacheable(value));
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: eventSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    if (body.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", body.class_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!cls) {
        throw new AuthError("Invalid class for this school", 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from("calendar_events")
      .insert({
        school_id: schoolId,
        title: body.title,
        description: body.description ?? null,
        event_date: body.event_date,
        end_date: body.end_date ?? null,
        event_type: asEventType(body.event_type),
        affects_attendance: body.affects_attendance ?? false,
        class_id: body.class_id ?? null,
        is_public: body.is_public ?? true,
        created_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "calendar_event_created",
      entity_type: "calendar_event",
      entity_id: data?.id ?? null,
      new_value: { title: body.title },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return data;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN"],
  schema: eventSchema.partial().extend({ id: z.string().uuid() }),
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { id, ...updates } = body;

    const { data: existing } = await ctx.supabase
      .from("calendar_events")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (!existing) {
      throw new AuthError("Event not found", 404);
    }

    if (updates.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", updates.class_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!cls) {
        throw new AuthError("Invalid class for this school", 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from("calendar_events")
      .update(
        updates as unknown as Database["public"]["Tables"]["calendar_events"]["Update"],
      )
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      throw new AuthError("Event ID is required", 400);
    }

    const { error } = await ctx.supabase
      .from("calendar_events")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "calendar_event_deleted",
      entity_type: "calendar_event",
      entity_id: id,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { deleted: true };
  },
});