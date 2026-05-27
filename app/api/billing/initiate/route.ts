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

const initiateSchema = z.object({
  plan: z.enum(['starter', 'growth', 'pro']),
});

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN']);

    const body = await request.json();
    const parsed = initiateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { plan } = parsed.data;
    const amount = PLAN_PRICES[plan];
    if (!amount) {
      return errorResponse('Invalid plan', 400);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skuli.app';
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) {
      return errorResponse('Payment gateway not configured', 500);
    }

    // Get school details for the payment
    const { data: school, error: schoolErr } = await ctx.supabase
      .from('schools')
      .select('name, email, phone')
      .eq('id', schoolId)
      .single();

    if (schoolErr || !school) {
      return errorResponse('School not found', 404);
    }

    const txRef = `SKULI-${schoolId.slice(0, 8)}-${Date.now()}`;

    const flwResponse = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount,
        currency: 'UGX',
        redirect_url: `${appUrl}/dashboard/settings/billing?payment_status=success`,
        customer: {
          email: school.email || ctx.user.email,
          name: school.name,
          phonenumber: school.phone || '',
        },
        meta: {
          school_id: schoolId,
          plan,
        },
        customizations: {
          title: 'SKULI Subscription',
          description: `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`,
          logo: `${appUrl}/logo.png`,
        },
      }),
    });

    const flwData = await flwResponse.json();

    if (flwData.status !== 'success' || !flwData.data?.link) {
      return errorResponse(flwData.message || 'Failed to initiate payment', 502);
    }

    // Create invoice record
    await ctx.supabase.from('subscription_invoices').insert({
      school_id: schoolId,
      plan,
      amount,
      currency: 'UGX',
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      flutterwave_tx_id: txRef,
    } as Record<string, unknown>);

    return successResponse({ payment_link: flwData.data.link });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error('POST /api/billing/initiate error:', e);
    return errorResponse('Internal server error', 500);
  }
}
