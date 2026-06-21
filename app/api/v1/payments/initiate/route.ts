import { z } from "zod";
import { route, AuthError } from "@/lib/http";
import { generateTuitionRef } from "@/lib/utils/pesapal-ref";
import { sanitizePhoneForPayment } from "@/lib/utils/phone";
import { submitOrderRequest } from "@/lib/gateways/pesapal";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

// Maximum UGX per single tuition payment - 200M UGX (?$55k) is a generous
// practical ceiling that still rejects obviously malicious / typo'd values.
const MAX_TUITION_AMOUNT_UGX = 200_000_000;

const schema = z.object({
  student_id: z.string().uuid(),
  amount: z.number().positive().max(MAX_TUITION_AMOUNT_UGX),
  fee_type_id: z.string().uuid().optional(),
  fee_type_label: z.string().min(1).max(100),
  phone: z.string().min(9),
});

export const POST = route({
  roles: ["PARENT", "SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema,
  handler: async (ctx, body) => {
    // Rate limit: 10 payment initiations per user per 5 minutes.
    // Prevents spamming the gateway and creating orphan PENDING tuition rows.
    const rl = await checkRateLimitAsync(
      `pay-init:${ctx.user.id}`,
      10,
      5 * 60 * 1000
    );
    if (!rl.success) {
      throw new AuthError(
        "Too many payment requests. Please try again later.",
        429,
      );
    }

    const { student_id, amount, fee_type_id, fee_type_label, phone } = body;

    // -- Security: sanitise phone number -------------------------------
    let cleanPhone: string;
    try {
      cleanPhone = sanitizePhoneForPayment(phone);
    } catch (e) {
      throw new AuthError((e as Error).message, 400);
    }

    const supabase = ctx.supabase;

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, school_id, full_name, admission_number, parent_phone, parent_email')
      .eq('id', student_id)
      .eq('is_deleted', false)
      .single();

    if (studentErr || !student) throw new AuthError("Student not found", 404);
    const st = student as unknown as {
      id: string;
      school_id: string;
      full_name: string;
      parent_email: string | null;
    };

    // Parents may only pay for their own children.
    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent. The previous version
    // accepted a parent_students link OR an email match against
    // students.parent_email — but email is mutable and not unique, so
    // a parent who shared a family email with another parent's child
    // could pay for that child. We now require a parent_students
    // link row and reject otherwise.
    if (ctx.profile.role === 'PARENT') {
      const { data: link } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', ctx.user.id)
        .eq('student_id', student_id)
        .maybeSingle();

      if (!link) {
        throw new AuthError(
          "You can only pay fees for your own children",
          403,
        );
      }
    }

    const { data: school } = await supabase
      .from('schools')
      .select('id, name, school_code, email, phone, pesapal_ipn_id')
      .eq('id', st.school_id)
      .single();

    const sch = school as unknown as {
      id: string;
      name: string;
      school_code: string | null;
      pesapal_ipn_id: string | null;
    } | null;

    if (!sch?.pesapal_ipn_id) {
      throw new AuthError(
        "Online payments not configured for this school. Contact the school admin.",
        400,
      );
    }

    const { data: term } = await supabase
      .from('terms')
      .select('id, name, academic_year_id')
      .eq('school_id', st.school_id)
      .eq('is_current', true)
      .maybeSingle();

    const t = term as unknown as { id: string; name: string } | null;
    const termLabel = t ? `${t.name.replace('Term', 'T')}-${new Date().getFullYear()}` : 'TERM';

    const merchantRef = await generateTuitionRef(sch.school_code || sch.id, student_id, termLabel);

    let feeAccountId: string | null = null;
    if (t) {
      const { data: fa } = await supabase
        .from('fee_accounts')
        .select('id')
        .eq('student_id', student_id)
        .eq('term_id', t.id)
        .maybeSingle();
      feeAccountId = (fa as { id: string } | null)?.id || null;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skuli.app';
    const callbackUrl = `${appUrl}/api/webhooks/pesapal`;

    const pesapalResponse = await submitOrderRequest({
      id: merchantRef,
      currency: 'UGX',
      amount,
      description: `${fee_type_label} - ${st.full_name} - ${sch.name}`,
      callbackUrl,
      notificationId: sch.pesapal_ipn_id,
      billingAddress: {
        phoneNumber: `+${cleanPhone}`,
        emailAddress: st.parent_email || ctx.user.email || undefined,
        firstName: st.full_name.split(' ')[0],
        lastName: st.full_name.split(' ').slice(1).join(' ') || undefined,
      },
    });

    await supabase.from('tuition_payments').insert({
      id: merchantRef,
      school_id: st.school_id,
      student_id,
      fee_account_id: feeAccountId,
      fee_type_id: fee_type_id || null,
      fee_type_label,
      amount,
      status: 'PENDING',
      pesapal_order_tracking_id: pesapalResponse.orderTrackingId,
      pesapal_redirect_url: pesapalResponse.redirectUrl,
      payment_description: `${fee_type_label} - ${termLabel}`,
      initiated_by_user_id: ctx.user.id,
    } as never);

    await supabase.from('audit_logs').insert({
      school_id: st.school_id,
      user_id: ctx.user.id,
      action: 'tuition_payment_initiated',
      entity_type: 'tuition_payment',
      entity_id: null,
      old_value: null,
      new_value: {
        merchant_ref: merchantRef,
        student_id,
        amount,
        fee_type_label,
        pesapal_tracking_id: pesapalResponse.orderTrackingId,
      },
      ip_address: null,
    } as never);

    return {
      redirect_url: pesapalResponse.redirectUrl,
      merchant_reference: merchantRef,
      order_tracking_id: pesapalResponse.orderTrackingId,
    };
  },
});
