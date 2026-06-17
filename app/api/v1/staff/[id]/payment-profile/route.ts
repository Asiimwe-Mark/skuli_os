import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from '@/lib/api-helpers';
import { sanitizePhoneForPayment } from '@/lib/utils/phone';

const patchSchema = z.object({
  preferred_method: z.enum(['MOBILE_MONEY', 'BANK']),
  // Mobile number: allow up to 20 chars to accommodate +country code variants.
  // sanitizePhoneForPayment() will still throw on invalid Uganda formats.
  mobile_number: z.string().max(20).optional().nullable(),
  bank_code: z.string().max(50).optional().nullable(),
  bank_name: z.string().max(100).optional().nullable(),
  // Bank account numbers in Uganda are typically 10-13 digits; cap at 30.
  account_number: z.string().max(30).optional().nullable(),
});

/**
 * Audit 3.22: this route does not call `requireRole` directly because
 * the authorization model is more nuanced than a simple allow-list:
 *   - SCHOOL_ADMIN, BURSAR, SUPER_ADMIN can manage any staff profile
 *   - A staff member can manage their own profile (when their user
 *     row links to the staff row via `staff.user_id`)
 *
 * `canManage` encodes that. The route still requires a school_id
 * (this is a school-scoped resource) and the staff row must belong
 * to the caller's school.
 */
async function canManage(
  ctx: Awaited<ReturnType<typeof getSupabaseAndUser>>,
  staffId: string,
  schoolId: string
): Promise<boolean> {
  if (['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'].includes(ctx.profile.role)) return true;
  // A staff member may manage their own profile
  const { data } = await ctx.supabase
    .from('staff')
    .select('user_id')
    .eq('id', staffId)
    .eq('school_id', schoolId)
    .maybeSingle();
  return (data as { user_id: string | null } | null)?.user_id === ctx.user.id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { id } = await params;
    if (!(await canManage(ctx, id, schoolId))) return errorResponse('Forbidden', 403);

    const { data } = await ctx.supabase
      .from('staff_payment_profiles')
      .select('id, staff_id, preferred_method, mobile_number, bank_code, bank_name, account_number, updated_at')
      .eq('staff_id', id)
      .eq('school_id', schoolId)
      .maybeSingle();

    return successResponse(data || null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { id } = await params;
    if (!(await canManage(ctx, id, schoolId))) return errorResponse('Forbidden', 403);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);
    const p = parsed.data;

    // Validate mobile number for MoMo
    if (p.preferred_method === 'MOBILE_MONEY') {
      if (!p.mobile_number) return errorResponse('Mobile number is required for Mobile Money', 400);
      try {
        sanitizePhoneForPayment(p.mobile_number);
      } catch (e) {
        return errorResponse((e as Error).message, 400);
      }
    } else if (p.preferred_method === 'BANK') {
      if (!p.bank_code || !p.account_number) {
        return errorResponse('Bank code and account number are required for Bank payouts', 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from('staff_payment_profiles')
      .upsert(
        {
          school_id: schoolId,
          staff_id: id,
          preferred_method: p.preferred_method,
          mobile_number: p.mobile_number || null,
          bank_code: p.bank_code || null,
          bank_name: p.bank_name || null,
          account_number: p.account_number || null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'staff_id' }
      )
      .select()
      .single();

    if (error) return dbError(error, 'Failed to save payment profile. Please check the details and try again.', 400);
    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}
