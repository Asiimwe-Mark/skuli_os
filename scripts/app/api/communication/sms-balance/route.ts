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
// Max 500 entries to prevent memory leaks; stale entries are pruned on access.
const balanceCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

function pruneCache() {
  if (balanceCache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of balanceCache) {
    if (entry.expires <= now) balanceCache.delete(key);
  }
  // If still over limit after pruning expired, delete oldest entries
  if (balanceCache.size > MAX_CACHE_ENTRIES) {
    const keysToDelete = [...balanceCache.keys()].slice(0, balanceCache.size - MAX_CACHE_ENTRIES);
    for (const key of keysToDelete) balanceCache.delete(key);
  }
}

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
      // Pre-launch B5: bound the upstream AT call. The SDK does not
      // expose a timeout, so we race it against a 5s timer. On timeout
      // we serve the last cached value (even if stale) so the UI does
      // not block on a slow AT API.
      let appData: unknown;
      const cached = balanceCache.get(schoolId);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AT balance timeout')), 5000)
      );
      try {
        appData = await Promise.race([
          fetchApplicationData(credentials),
          timeout,
        ]);
      } catch (err) {
        console.warn('[sms-balance] AT API timeout/error, serving cached', err);
        if (cached) {
          return successResponse({ ...(cached.data as Record<string, unknown>), stale: true });
        }
        return errorResponse('Africa\'s Talking balance API timed out', 502);
      }
      const balanceData = {
        balance: (appData as Record<string, unknown>)?.userData
          ? ((appData as Record<string, unknown>).userData as Record<string, unknown>)?.balance
          : 0,
        currency: 'UGX',
        account: credentials.username,
      };

      // Cache the result
      pruneCache();
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
