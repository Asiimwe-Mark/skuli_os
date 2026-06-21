// app/api/communication/threads/[id]/route.ts
import { z } from "zod";
import { route, dbError } from "@/lib/http";

const patchBodySchema = z.object({
  is_read: z.boolean(),
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: patchBodySchema,
  handler: async (ctx, body, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id: threadId } = (params ?? {}) as { id: string };

    const { data, error } = await ctx.supabase
      .from("message_threads")
      .update({ is_read: body.is_read })
      .eq("id", threadId)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");
    return data;
  },
});
