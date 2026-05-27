import AfricasTalking from 'africastalking';

export interface ATCredentials {
  username: string;
  apiKey: string;
}

let cachedClient: ReturnType<typeof AfricasTalking> | null = null;

/**
 * Fetch and decrypt a school's Africa's Talking credentials from the database.
 */
export async function getSchoolCredentials(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  schoolId: string
): Promise<ATCredentials | null> {
  const { data: school, error } = await supabase
    .from('schools')
    .select('africas_talking_username_enc, africas_talking_api_key_enc')
    .eq('id', schoolId)
    .single();

  if (error || !school) return null;

  const encUsername = school.africas_talking_username_enc as string | null;
  const encApiKey = school.africas_talking_api_key_enc as string | null;

  if (!encUsername || !encApiKey) return null;

  const vaultKey = process.env.SUPABASE_VAULT_SECRET_KEY;
  if (!vaultKey) return null;

  try {
    const { data: decryptedUsername } = await supabase.rpc('decrypt_secret', {
      encrypted: encUsername,
      key: vaultKey,
    });
    const { data: decryptedApiKey } = await supabase.rpc('decrypt_secret', {
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
 * Uses the school's credentials or falls back to env vars.
 */
export function getAfricasTalkingClient(credentials?: ATCredentials) {
  if (cachedClient && !credentials) return cachedClient;

  const username = credentials?.username || process.env.AFRICASTALKING_USERNAME || 'sandbox';
  const apiKey = credentials?.apiKey || process.env.AFRICASTALKING_API_KEY || '';

  if (!apiKey) {
    throw new Error('Africa\'s Talking API key is required');
  }

  const client = AfricasTalking({
    username,
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
  const application = client.APPLICATION;
  return application.fetchApplicationData();
}
