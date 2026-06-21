import { z } from "zod";
import { route, AuthError } from "@/lib/http";
import { submitOrderRequest } from "@/lib/gateways/pesapal";

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

const schema = z.object({ plan: z.enum(["starter", "growth", "pro"]) });

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const amount = PLAN_PRICES[body.plan];

    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name, email, phone, pesapal_ipn_id")
      .eq("id", schoolId)
      .single();

    if (!school) throw new AuthError("School not found", 404);

    const s = school as unknown as {
      name: string;
      email: string | null;
      phone: string | null;
      pesapal_ipn_id: string | null;
    };

    const ipnId = s.pesapal_ipn_id || process.env.PESAPAL_IPN_ID;
    if (!ipnId) {
      throw new AuthError(
        "Payment gateway not configured. Contact support.",
        500,
      );
    }

    const txRef = `SUB-${schoolId.slice(0, 8).toUpperCase()}-${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app";

    const pesapalResponse = await submitOrderRequest({
      id: txRef,
      currency: "UGX",
      amount,
      description: `SKULI ${body.plan.charAt(0).toUpperCase() + body.plan.slice(1)} Subscription`,
      callbackUrl: `${appUrl}/api/webhooks/pesapal`,
      cancellationUrl: `${appUrl}/dashboard/settings/billing`,
      notificationId: ipnId,
      billingAddress: {
        emailAddress: s.email || ctx.user.email,
        phoneNumber: s.phone || undefined,
        firstName: "School",
        lastName: s.name,
      },
    });

    await ctx.supabase.from("subscription_invoices").insert({
      school_id: schoolId,
      pesapal_tx_id: txRef,
      plan: body.plan,
      amount,
      currency: "UGX",
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
    } as never);

    return { payment_link: pesapalResponse.redirectUrl };
  },
});