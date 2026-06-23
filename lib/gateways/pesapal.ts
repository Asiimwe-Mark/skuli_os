/**
 * Pesapal payment gateway client.
 *
 * Implements the contract the rest of the payment/payroll system depends on:
 *   - getPesapalToken()           cached Bearer token (pesapal_token_cache table)
 *   - registerIPN(callbackUrl)    register an IPN URL, returns the IPN id
 *   - submitOrderRequest(order)   create a hosted-checkout order
 *   - getTransactionStatus(id)    server-to-server verification (NEVER trust webhook params)
 *   - disburseFunds(req)          B2C payout (salary disbursement)
 *
 * Security:
 *   - All credentials come from process.env via getPesapalEnv(), which throws
 *     explicitly when anything is missing. No hardcoded secrets.
 *   - Every external HTTP call goes through fetchWithTimeout() with a 10s cap.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

const SANDBOX_BASE = 'https://cybqa.pesapal.com/pesapalv3';
const LIVE_BASE = 'https://pay.pesapal.com/v3';
const REQUEST_TIMEOUT_MS = 10_000;

export interface PesapalEnv {
  consumerKey: string;
  consumerSecret: string;
  sandbox: boolean;
  baseUrl: string;
}

/**
 * Resolve and validate Pesapal credentials from the environment.
 * Throws explicitly when a required variable is missing.
 */
export function getPesapalEnv(): PesapalEnv {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  const sandbox = process.env.PESAPAL_SANDBOX === 'true';

  if (!consumerKey) throw new Error('Missing required environment variable: PESAPAL_CONSUMER_KEY');
  if (!consumerSecret) throw new Error('Missing required environment variable: PESAPAL_CONSUMER_SECRET');

  return {
    consumerKey,
    consumerSecret,
    sandbox,
    baseUrl: sandbox ? SANDBOX_BASE : LIVE_BASE,
  };
}

/**
 * fetch wrapper enforcing a hard 10s timeout on all external Pesapal calls.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function pesapalFetch<T>(
  path: string,
  init: RequestInit,
  token?: string
): Promise<T> {
  const { baseUrl } = getPesapalEnv();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Pesapal returned non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Pesapal request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return json as T;
}

interface AuthResponse {
  token?: string;
  expiryDate?: string;
  error?: unknown;
  message?: string;
}

/**
 * Acquire (and cache) a Pesapal Bearer token. Tokens are cached in the
 * pesapal_token_cache table and reused until ~1 minute before expiry.
 */
export async function getPesapalToken(): Promise<string> {
  const supabase = createAdminClient();

  // Try cache first
  const { data: cached } = await supabase
    .from('pesapal_token_cache')
    .select('token, expires_at')
    .eq('id', 'singleton')
    .maybeSingle();

  if (cached?.token && cached.expires_at) {
    const expiresAt = new Date(cached.expires_at).getTime();
    if (expiresAt - Date.now() > 60_000) {
      return cached.token as string;
    }
  }

  const { consumerKey, consumerSecret } = getPesapalEnv();
  const auth = await pesapalFetch<AuthResponse>('/api/Auth/RequestToken', {
    method: 'POST',
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  if (!auth.token) {
    throw new Error(`Pesapal token request failed: ${auth.message || JSON.stringify(auth.error)}`);
  }

  const expiresAt = auth.expiryDate
    ? new Date(auth.expiryDate).toISOString()
    : new Date(Date.now() + 5 * 60_000).toISOString();

  // Best-effort cache upsert; failure to cache must not break auth.
  try {
    await supabase
      .from('pesapal_token_cache')
      // cast payload to any to satisfy TS when table types are not available
      .upsert({ id: 'singleton', token: auth.token, expires_at: expiresAt, updated_at: new Date().toISOString() } as any);
  } catch {
    // best-effort — ignore cache failures
  }

  return auth.token;
}

interface RegisterIPNResponse {
  ipn_id?: string;
  url?: string;
  error?: unknown;
}

/**
 * Register an IPN (Instant Payment Notification) URL with Pesapal.
 * Returns the IPN id to persist on the school.
 */
export async function registerIPN(callbackUrl: string): Promise<string> {
  const token = await getPesapalToken();
  const res = await pesapalFetch<RegisterIPNResponse>(
    '/api/URLSetup/RegisterIPN',
    {
      method: 'POST',
      body: JSON.stringify({ url: callbackUrl, ipn_notification_type: 'GET' }),
    },
    token
  );
  if (!res.ipn_id) {
    throw new Error(`Pesapal IPN registration failed: ${JSON.stringify(res.error || res)}`);
  }
  return res.ipn_id;
}

export interface PesapalBillingAddress {
  phoneNumber?: string;
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
}

export interface PesapalOrder {
  id: string;             // merchant reference
  currency: string;
  amount: number;
  description: string;
  callbackUrl: string;
  cancellationUrl?: string;
  notificationId: string; // IPN id
  billingAddress?: PesapalBillingAddress;
}

interface SubmitOrderResponse {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: unknown;
  message?: string;
}

export interface SubmitOrderResult {
  orderTrackingId: string;
  merchantReference: string;
  redirectUrl: string;
}

/**
 * Submit an order to Pesapal and obtain a hosted-checkout redirect URL.
 */
export async function submitOrderRequest(order: PesapalOrder): Promise<SubmitOrderResult> {
  const token = await getPesapalToken();
  const body = {
    id: order.id,
    currency: order.currency,
    amount: order.amount,
    description: order.description.slice(0, 100),
    callback_url: order.callbackUrl,
    cancellation_url: order.cancellationUrl,
    notification_id: order.notificationId,
    billing_address: order.billingAddress
      ? {
          phone_number: order.billingAddress.phoneNumber,
          email_address: order.billingAddress.emailAddress,
          first_name: order.billingAddress.firstName,
          last_name: order.billingAddress.lastName,
        }
      : undefined,
  };

  const res = await pesapalFetch<SubmitOrderResponse>(
    '/api/Transactions/SubmitOrderRequest',
    { method: 'POST', body: JSON.stringify(body) },
    token
  );

  if (!res.order_tracking_id || !res.redirect_url) {
    throw new Error(`Pesapal SubmitOrderRequest failed: ${res.message || JSON.stringify(res.error || res)}`);
  }

  return {
    orderTrackingId: res.order_tracking_id,
    merchantReference: res.merchant_reference || order.id,
    redirectUrl: res.redirect_url,
  };
}

interface TransactionStatusResponse {
  payment_status_description?: string; // 'Completed' | 'Failed' | 'Invalid' | 'Reversed'
  status_code?: number;                // 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED
  amount?: number;
  confirmation_code?: string;
  merchant_reference?: string;
  payment_method?: string;
  error?: { error_type?: string; code?: string; message?: string } | null;
  message?: string;
}

export interface TransactionStatus {
  paymentStatus: 'COMPLETED' | 'FAILED' | 'REVERSED' | 'INVALID' | 'PENDING';
  amount: number;
  confirmationCode?: string;
  merchantReference?: string;
  paymentMethod?: string;
  raw?: TransactionStatusResponse;
  error?: string;
}

function mapStatus(res: TransactionStatusResponse): TransactionStatus['paymentStatus'] {
  const desc = (res.payment_status_description || '').toUpperCase();
  if (desc === 'COMPLETED') return 'COMPLETED';
  if (desc === 'FAILED') return 'FAILED';
  if (desc === 'REVERSED') return 'REVERSED';
  if (desc === 'INVALID') return 'INVALID';
  // Fall back to numeric status_code
  switch (res.status_code) {
    case 1: return 'COMPLETED';
    case 2: return 'FAILED';
    case 3: return 'REVERSED';
    case 0: return 'INVALID';
    default: return 'PENDING';
  }
}

/**
 * Server-to-server verification of a transaction's true status.
 * This is the ONLY trustworthy source of payment outcome — webhook query
 * params must never be used to set a terminal state.
 */
export async function getTransactionStatus(orderTrackingId: string): Promise<TransactionStatus> {
  try {
    const token = await getPesapalToken();
    const res = await pesapalFetch<TransactionStatusResponse>(
      `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
      { method: 'GET' },
      token
    );
    return {
      paymentStatus: mapStatus(res),
      amount: Number(res.amount) || 0,
      confirmationCode: res.confirmation_code,
      merchantReference: res.merchant_reference,
      paymentMethod: res.payment_method,
      raw: res,
    };
  } catch (err) {
    return {
      paymentStatus: 'PENDING',
      amount: 0,
      error: err instanceof Error ? err.message : 'Unknown error verifying transaction',
    };
  }
}

export interface DisbursementAccount {
  mobileNumber?: string; // +256...
  network?: 'MTN' | 'AIRTEL';
  bankCode?: string;
  accountNumber?: string;
}

export interface DisbursementRequest {
  uniqueOrderId: string; // idempotency key — gateway dedupes on this
  amount: number;
  currency: string;
  description: string;
  account: DisbursementAccount;
}

export interface DisbursementResult {
  success: boolean;
  trackingId?: string;
  error?: string;
}

interface DisburseResponse {
  status?: string | number;
  tracking_id?: string;
  message?: string;
  error?: unknown;
}

/**
 * B2C disbursement (salary payout) via Pesapal Openfloat.
 * `uniqueOrderId` is passed straight through as the idempotency key so the
 * gateway drops duplicate submissions on retry.
 */
export async function disburseFunds(req: DisbursementRequest): Promise<DisbursementResult> {
  try {
    const token = await getPesapalToken();
    const body = {
      unique_id: req.uniqueOrderId,
      amount: req.amount,
      currency: req.currency,
      description: req.description.slice(0, 100),
      mobile_number: req.account.mobileNumber,
      network: req.account.network,
      bank_code: req.account.bankCode,
      account_number: req.account.accountNumber,
    };
    const res = await pesapalFetch<DisburseResponse>(
      '/api/Transactions/SubmitB2CRequest',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    const ok = res.status === '200' || res.status === 200 || res.status === 'success';
    if (ok) {
      return { success: true, trackingId: res.tracking_id };
    }
    return { success: false, error: res.message || JSON.stringify(res.error || res) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown disbursement error' };
  }
}
