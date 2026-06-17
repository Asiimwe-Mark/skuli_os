import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWelcomeEmail } from '@/lib/email/send';
import { z } from 'zod';
import { checkRateLimitAsync } from '@/lib/utils/rate-limit';
import { getClassLevels } from '@/lib/utils/class-levels';
import type { Database } from '@/types/database';

const onboardSchema = z.object({
  school: z.object({
    name: z.string().min(2),
    address: z.string().optional(),
    district: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().nullable(),
    school_type: z.enum(['primary', 'secondary', 'nursery', 'both']),
    logo_url: z.string().url().optional().nullable(),
    motto: z.string().optional().nullable(),
  }),
  admin: z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  plan: z.enum(['starter', 'growth', 'pro']),
  start_trial: z.boolean().default(true),
  referral_code: z.string().optional(),
  country_code: z.enum(['UG', 'KE', 'TZ']).default('UG'),
});

/**
 * Generate a unique school code.
 *
 * MIN-1 fix: the old implementation produced only 2-character codes
 * (initials) which collide almost immediately for common Ugandan school
 * names ("Kampala Parents" → "KP", "Kampala Primary" → "KP").
 *
 * New format: {initials}{4-digit-year}, e.g. "KP2026".
 * - Initials: up to 4 words → up to 4 chars (each word's first letter)
 * - Year: current 4-digit year as a disambiguator
 * - The collision loop appends a counter (KP2026, KP20261, KP20262…)
 *   which in practice only fires for schools with identical initials
 *   AND the same year, which is extremely rare.
 *
 * Examples:
 *   "Kampala Parents School"     → "KPS2026"
 *   "St Mary's"                  → "SM2026"
 *   "Our Lady of Good Counsel"   → "OLGC2026"
 *   "AIC"                        → "AIC2026"
 */
function generateSchoolCode(name: string): string {
  const year = new Date().getFullYear().toString();
  // Split on whitespace only. We do NOT split on apostrophes because
  // "St Mary's" is one school name, not three words ("St" + "Mary" +
  // "s"). Contractions stay intact; trailing punctuation is stripped
  // from each word below.
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[.,-]+$/, "")) // strip trailing punctuation
    .filter(Boolean)
    .filter((w) => !['of', 'the', 'and', 'for', 'in', 'at'].includes(w.toLowerCase()));

  let initials: string;
  if (words.length === 0) {
    initials = name.slice(0, 4).toUpperCase().replace(/\s/g, '');
  } else if (words.length === 1) {
    // Single word: take up to 4 chars of the word
    initials = words[0].slice(0, 4).toUpperCase();
  } else {
    // Multi-word: first letter of each word, up to 4 words
    initials = words
      .slice(0, 4)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  return `${initials}${year}`;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 registrations per hour per IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rl = await checkRateLimitAsync(`onboard:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { school, admin, plan, start_trial, referral_code, country_code } = parsed.data;
    const supabase = createAdminClient();

    // Generate unique school code with collision handling.
    // Base code uses initials + year (e.g. "KPS2026").
    // If it collides, append a counter ("KPS20261", "KPS20262"...).
    const baseCode = generateSchoolCode(school.name);
    let schoolCode = baseCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data: existing } = await supabase
        .from('schools')
        .select('id')
        .eq('school_code', schoolCode)
        .maybeSingle();
      if (!existing) break;
      // First collision → "KPS20261", second → "KPS20262", etc.
      schoolCode = `${baseCode}${attempt + 1}`;
    }

    // 1. Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: admin.email,
        password: admin.password,
        email_confirm: true,
        user_metadata: { full_name: admin.full_name },
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: authError?.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    // 2. Create school
    const trialEndsAt = start_trial
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const maxStudents = plan === 'starter' ? 200 : plan === 'growth' ? 500 : 99999;

    const schoolInsert: Record<string, unknown> = {
      name: school.name,
      school_code: schoolCode,
      school_type: school.school_type,
      max_students: maxStudents,
      country_code,
    };
    if (start_trial) {
      schoolInsert.subscription_plan = plan;
      schoolInsert.subscription_status = 'trial';
      schoolInsert.trial_ends_at = trialEndsAt;
    } else {
      schoolInsert.subscription_plan = plan;
      schoolInsert.subscription_status = 'active';
    }
    schoolInsert.address  = school.address  ?? null;
    schoolInsert.district = school.district ?? null;
    schoolInsert.phone    = school.phone    ?? null;
    schoolInsert.email    = school.email    ?? null;
    schoolInsert.logo_url = school.logo_url ?? null;
    schoolInsert.motto    = school.motto    ?? null;
    schoolInsert.group_id = null;

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .insert(schoolInsert as unknown as Database['public']['Tables']['schools']['Insert'])
      .select('id')
      .single();

    if (schoolError || !schoolData) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error('[onboard] school insert failed:', schoolError);
      return NextResponse.json(
        { success: false, error: 'Failed to create school' },
        { status: 500 }
      );
    }

    // 3. Upsert user profile
    const { error: profileError } = await supabase.from('users').upsert({
      id: authData.user.id,
      school_id: schoolData.id,
      role: 'SCHOOL_ADMIN' as const,
      full_name: admin.full_name,
      phone: null,
      email: admin.email,
      avatar_url: null,
      is_active: true,
    });

    if (profileError) {
      await supabase.from('schools').delete().eq('id', schoolData.id);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { success: false, error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    // 4. Create default academic year
    const currentYear = new Date().getFullYear().toString();
    const { data: academicYear } = await supabase
      .from('academic_years')
      .insert({
        school_id: schoolData.id,
        name: currentYear,
        level: null,
        is_current: true,
      })
      .select('id')
      .single();

    // 5. Create current term
    if (academicYear) {
      await supabase.from('terms').insert({
        school_id: schoolData.id,
        academic_year_id: academicYear.id,
        name: 'Term1' as const,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        is_current: true,
      });
    }

    // 5b. Seed default class levels
    const defaultLevels = getClassLevels(school.school_type);
    if (defaultLevels.length > 0) {
      const classRows = defaultLevels.map((level) => ({
        school_id: schoolData.id,
        name: level,
        level,
        stream: null,
        class_teacher_id: null,
        capacity: null,
        is_deleted: false,
      }));
      await supabase
        .from('classes')
        .insert(classRows as unknown as Database['public']['Tables']['classes']['Insert']);
    }

    // 6. Create notification preferences (sms_enabled column added in 0031)
    await supabase.from('notification_preferences').insert({
      school_id: schoolData.id,
      sms_enabled: false,
      send_receipt_sms: false,
      send_absence_sms: false,
      send_weekly_defaulter: false,
      defaulter_reminder_day: 5,
      defaulter_reminder_hour: 8,
      send_report_card_sms: false,
      send_term_start_sms: false,
    } as Database['public']['Tables']['notification_preferences']['Insert']);

    // 7. Audit log
    await supabase.from('audit_logs').insert({
      school_id: schoolData.id,
      user_id: authData.user.id,
      action: 'SCHOOL_CREATED',
      entity_type: 'school',
      entity_id: schoolData.id,
      new_value: { name: school.name, plan, school_code: schoolCode },
      old_value: null,
      ip_address: null,
    });

    // 7b. Apply referral credit
    if (referral_code) {
      try {
        await supabase.rpc('apply_referral_credit', {
          p_code: referral_code,
          p_new_school_id: schoolData.id,
        });
      } catch (refErr) {
        console.error('[onboard] referral apply failed:', refErr);
      }
    }

    // 8. Send welcome email
    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://skuli.app'}/login`;
      await sendWelcomeEmail(admin.email, school.name, admin.full_name, loginUrl);
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      data: { school_id: schoolData.id, user_id: authData.user.id },
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
