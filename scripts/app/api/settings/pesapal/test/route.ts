import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';
import { getPesapalToken } from '@/lib/gateways/pesapal';

/** GET: test the Pesapal connection by acquiring a Bearer token. */
export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);

    try {
      const token = await getPesapalToken();
      return successResponse({ ok: !!token, message: 'Connection successful' });
    } catch (err) {
      return successResponse({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    }
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    return errorResponse('Internal server error', 500);
  }
}
