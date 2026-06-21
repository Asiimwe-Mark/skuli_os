import { z } from "zod";
import { route, AuthError } from "@/lib/http";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(255).optional(),
  is_active: z.boolean().optional(),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;
    const { data } = await ctx.supabase
      .from('fee_types')
      .select('id, name, description, is_active, created_at')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name');
    return data || [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { data, error } = await ctx.supabase
      .from('fee_types')
      .insert({ school_id: schoolId, ...body } as never)
      .select()
      .single();
    if (error) throw new AuthError("Failed to create fee type. The name may already exist.", 400);
    return data;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: patchSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { id, ...updates } = body;
    const { data, error } = await ctx.supabase
      .from('fee_types')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();
    if (error) throw new AuthError("Failed to update fee type. Please check the values and try again.", 400);
    return data;
  },
});
