import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';
import { submitOrderRequest } from '@/lib/gateways/pesapal';

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

const schema = z.object({ plan: z.enum(['starter', 'growth', 'pro']) });

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN']);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { plan } = parsed.data;
    const amount = PLAN_PRICES[plan];

    const { data: school } = await ctx.supabase
      .from('schools')
      .select('name, email, phone, pesapal_ipn_id')
      .eq('id', schoolId)
      .single();

    if (!school) return errorResponse('School not found', 404);

    const s = school as unknown as {
      name: string;
      email: string | null;
      phone: string | null;
      pesapal_ipn_id: string | null;
    };

    // Pesapal IPN must be configured before subscriptions can be paid
    const ipnId = s.pesapal_ipn_id || process.env.PESAPAL_IPN_ID;
    if (!ipnId) {
      return errorResponse('Payment gateway not configured. Contact support.', 500);
    }

    const txRef = `SUB-${schoolId.slice(0, 8).toUpperCase()}-${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skuli.app';

    const pesapalResponse = await submitOrderRequest({
      id: txRef,
      currency: 'UGX',
      amount,
      description: `SKULI ${plan.charAt(0).toUpperCase() + plan.slice(1)} Subscription`,
      callbackUrl: `${appUrl}/api/webhooks/pesapal`,
      cancellationUrl: `${appUrl}/dashboard/settings/billing`,
      notificationId: ipnId,
      billingAddress: {
        emailAddress: s.email || ctx.user.email,
        phoneNumber: s.phone || undefined,
        firstName: 'School',
        lastName: s.name,
      },
    });

    // Create pending invoice record
    await ctx.supabase.from('subscription_invoices').insert({
      school_id: schoolId,
      pesapal_tx_id: txRef,
      plan: plan,
      amount,
      currency: 'UGX',
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    } as never);

    return successResponse({ payment_link: pesapalResponse.redirectUrl });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('POST /api/billing/initiate error:', e);
    return errorResponse('Internal server error', 500);
  }
}
