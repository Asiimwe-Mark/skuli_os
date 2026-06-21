import AfricasTalking from 'africastalking';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ATCredentials {
  username: string;
  apiKey: string;
}

let cachedClient: ReturnType<typeof AfricasTalking> | null = null;

/**
 * Fetch and decrypt a school's Africa's Talking credentials from the database.
 *
 * Audit §14.2 / §8.7: the previous version called `decrypt_secret` via
 * the *caller's* authenticated Supabase client. Migration 0026 never
 * revoked EXECUTE on `decrypt_secret` from `authenticated`, so any
 * logged-in user could call `decrypt_secret(ciphertext, key)` with
 * the SUPABASE_VAULT_SECRET_KEY they could fish out of the bundle
 * (or a single SQLi sink). With the key, every school's stored
 * Pesapal / Resend / AT credentials decrypt.
 *
 * This now uses the admin client (service role) to call
 * `decrypt_secret`. The migration 0028_grants_lock_extras below
 * also REVOKEs EXECUTE on `encrypt_secret` / `decrypt_secret` from
 * anon + authenticated, so the only caller in the system is the
 * service role used by this helper.
 */
export async function getSchoolCredentials(
  _supabase: SupabaseClient<Database>,
  schoolId: string
): Promise<ATCredentials | null> {
  const admin = createAdminClient();
  const { data: school, error } = await admin
    .from('schools')
    .select('africas_talking_username_enc, africas_talking_api_key_enc')
    .eq('id', schoolId)
    .single();

  if (error || !school) return null;

  const encUsername = school.africas_talking_username_enc;
  const encApiKey = school.africas_talking_api_key_enc;

  if (!encUsername || !encApiKey) return null;

  const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
  if (!vaultKey) return null;

  try {
    const { data: decryptedUsername } = await admin.rpc('decrypt_secret', {
      encrypted: encUsername,
      key: vaultKey,
    });
    const { data: decryptedApiKey } = await admin.rpc('decrypt_secret', {
      encrypted: encApiKey,
      key: vaultKey,
    });

    if (!decryptedUsername || !decryptedApiKey) return null;

    return {
      username: decryptedUsername as string,
      apiKey: decryptedApiKey as string,
    };
  } catch {
    return null;
  }
}

/**
 * Initialize Africa's Talking SDK.
 *
 * Audit §14.3: the previous version fell back to the platform's
 * `process.env.AFRICAS_TALKING_USERNAME || 'sandbox'` and
 * `process.env.AFRICAS_TALKING_API_KEY` whenever a school had no
 * credentials. A school that hadn't configured AT would silently
 * send SMS / initiate mobile money through the platform's account
 * — cross-tenant billing bleed and accidental real-money charges.
 *
 * The new behaviour: when `credentials` is omitted and the platform
 * fallback would be used, we throw. Callers that *intentionally*
 * want the platform account (e.g. an admin smoke test) must pass an
 * explicit `forcePlatform: true` so the cross-tenant billing path
 * is always loud.
 */
export function getAfricasTalkingClient(
  credentials?: ATCredentials,
  options?: { forcePlatform?: boolean }
) {
  if (cachedClient && !credentials) return cachedClient;

  const usePlatform = options?.forcePlatform === true;
  const username = credentials?.username
    ?? (usePlatform ? process.env.AFRICAS_TALKING_USERNAME : undefined);
  const apiKey = credentials?.apiKey
    ?? (usePlatform ? process.env.AFRICAS_TALKING_API_KEY : undefined);

  if (!credentials && !usePlatform) {
    throw new Error(
      "Africa's Talking credentials missing for school; refusing to fall back to platform account",
    );
  }
  if (!apiKey) {
    throw new Error("Africa's Talking API key is required");
  }

  const client = AfricasTalking({
    username: username ?? 'sandbox',
    apiKey,
  });

  if (!credentials) {
    cachedClient = client;
  }

  return client;
}

/**
 * Send SMS via Africa's Talking.
 */
export async function sendSms(
  options: {
    to: string | string[];
    message: string;
    from?: string;
  },
  credentials?: ATCredentials
) {
  const client = getAfricasTalkingClient(credentials);
  const sms = client.SMS;

  return sms.send({
    to: Array.isArray(options.to) ? options.to : [options.to],
    message: options.message,
    from: options.from,
  });
}

/**
 * Initiate mobile money payment via Africa's Talking.
 */
export async function initiateMobileMoney(
  options: {
    phoneNumber: string;
    currencyCode: string;
    amount: number;
    providerChannel?: string;
    metadata?: Record<string, string>;
  },
  credentials?: ATCredentials
) {
  const client = getAfricasTalkingClient(credentials);
  const mobileMoney = client.MOBILE_MONEY;

  return mobileMoney.payment({
    productName: 'SKULI School Fees',
    phoneNumber: options.phoneNumber,
    currencyCode: options.currencyCode,
    amount: options.amount,
    providerChannel: options.providerChannel,
    metadata: options.metadata,
  });
}

/**
 * Fetch application data (including balance) from Africa's Talking.
 */
export async function fetchApplicationData(credentials?: ATCredentials) {
  const client = getAfricasTalkingClient(credentials);
  // APPLICATION is available on the SDK client but not in the type definitions
  const application = (client as unknown as { APPLICATION: { fetchApplicationData: () => Promise<unknown> } }).APPLICATION;
  return application.fetchApplicationData();
}
