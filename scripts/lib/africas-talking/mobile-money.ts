import { initiateMobileMoney, type ATCredentials } from './client';

export type MobileMoneyProvider = 'mtn' | 'airtel';

export interface MobileMoneyPaymentOptions {
  phoneNumber: string;
  amount: number;
  currencyCode?: string;
  provider?: MobileMoneyProvider;
  metadata?: Record<string, string>;
}

export interface MobileMoneyResult {
  success: boolean;
  transactionId?: string;
  status?: string;
  description?: string;
  error?: string;
}

/**
 * Normalize Uganda phone number to international format.
 */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('256')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+256${cleaned.slice(1)}`;
  return `+256${cleaned}`;
}

/**
 * Get provider channel for the mobile money provider.
 */
function getProviderChannel(provider: MobileMoneyProvider): string {
  switch (provider) {
    case 'mtn':
      return '63404'; // MTN Uganda
    case 'airtel':
      return '63402'; // Airtel Uganda
    default:
      return '63404';
  }
}

/**
 * Initiate an STK push (mobile money payment request).
 */
export async function requestMobileMoneyPayment(
  options: MobileMoneyPaymentOptions,
  credentials?: ATCredentials
): Promise<MobileMoneyResult> {
  try {
    const phone = normalizePhone(options.phoneNumber);
    const providerChannel = options.provider
      ? getProviderChannel(options.provider)
      : undefined;

    const response = await initiateMobileMoney(
      {
        phoneNumber: phone,
        currencyCode: options.currencyCode || 'UGX',
        amount: options.amount,
        providerChannel,
        metadata: options.metadata,
      },
      credentials
    );

    return {
      success: response.status === 'PendingConfirmation' || response.status === 'Success',
      transactionId: response.transactionId,
      status: response.status,
      description: response.description,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format amount in UGX for display.
 */
export function formatUgxAmount(amount: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
  }).format(amount);
}
