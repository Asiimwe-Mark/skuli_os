import { staffSchema } from "@/lib/validations/staff";
import { route } from "@/lib/http";
import { createStaff, listStaff } from "@/lib/services/staff";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const isActive = url.searchParams.get("is_active");
    const search = url.searchParams.get("search");
    return listStaff(ctx, request, { isActive, search });
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: staffSchema,
  handler: async (ctx, body) => createStaff(ctx, body),
});