import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  AuthError,
} from '@/lib/api-helpers';

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

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { data } = await ctx.supabase
      .from('fee_types')
      .select('id, name, description, is_active, created_at')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name');
    return successResponse(data || []);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    return errorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);
    const { data, error } = await ctx.supabase
      .from('fee_types')
      .insert({ school_id: schoolId, ...parsed.data } as never)
      .select()
      .single();
    if (error) return dbError(error, 'Failed to create fee type. The name may already exist.');
    return successResponse(data, 201);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    return errorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);
    const { id, ...updates } = parsed.data;
    const { data, error } = await ctx.supabase
      .from('fee_types')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();
    if (error) return dbError(error, 'Failed to update fee type. Please check the values and try again.');
    return successResponse(data);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    return errorResponse('Internal server error', 500);
  }
}
