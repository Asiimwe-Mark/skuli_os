import { route } from "@/lib/http";
import { aggregateEmisData } from "@/lib/emis/aggregate";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const termId = request.nextUrl.searchParams.get("term_id") ?? undefined;
    const data = await aggregateEmisData(ctx.supabase, schoolId, termId);
    return data;
  },
});