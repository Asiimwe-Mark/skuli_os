import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';
import { getSchoolCredentials, fetchApplicationData } from '@/lib/africas-talking/client';

// Simple in-memory cache: schoolId -> { data, expires }
const balanceCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 60_000;

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);

    // Check cache
    const cached = balanceCache.get(schoolId);
    if (cached && cached.expires > Date.now()) {
      return successResponse(cached.data);
    }

    // Get school's decrypted AT credentials
    const credentials = await getSchoolCredentials(ctx.supabase, schoolId);
    if (!credentials) {
      return errorResponse('Africa\'s Talking credentials not configured. Please set them in Settings > API Keys.', 400);
    }

    try {
      const appData = await fetchApplicationData(credentials);
      const balanceData = {
        balance: (appData as Record<string, unknown>)?.userData
          ? ((appData as Record<string, unknown>).userData as Record<string, unknown>)?.balance
          : 0,
        currency: 'UGX',
        account: credentials.username,
      };

      // Cache the result
      balanceCache.set(schoolId, {
        data: balanceData,
        expires: Date.now() + CACHE_TTL_MS,
      });

      return successResponse(balanceData);
    } catch {
      return errorResponse('Failed to fetch SMS balance from Africa\'s Talking. Please verify your credentials.', 502);
    }
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('GET /api/communication/sms-balance error:', e);
    return errorResponse('Internal server error', 500);
  }
}
