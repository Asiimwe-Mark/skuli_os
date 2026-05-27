import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWelcomeEmail } from '@/lib/email/send';
import { z } from 'zod';

const onboardSchema = z.object({
  school: z.object({
    name: z.string().min(2),
    address: z.string().optional(),
    district: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().nullable(),
    school_type: z.enum(['primary', 'secondary', 'both']),
    logo_url: z.string().url().optional().nullable(),
  }),
  admin: z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  plan: z.enum(['starter', 'growth', 'pro']),
  start_trial: z.boolean().default(true),
});

function generateSchoolCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { school, admin, plan, start_trial } = parsed.data;
    const supabase = createAdminClient();

    const schoolCode = generateSchoolCode(school.name);

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

    const schoolInsert = {
      name: school.name,
      address: school.address ?? null,
      district: school.district ?? null,
      phone: school.phone ?? null,
      email: school.email ?? null,
      school_type: school.school_type,
      logo_url: school.logo_url ?? null,
      school_code: schoolCode,
      subscription_plan: plan,
      subscription_status: start_trial ? 'trial' : 'active',
      trial_ends_at: trialEndsAt,
      max_students: maxStudents,
    } as Record<string, unknown>;

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .insert(schoolInsert)
      .select('id')
      .single();

    if (schoolError || !schoolData) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { success: false, error: 'Failed to create school' },
        { status: 500 }
      );
    }

    // 3. Create user profile
    await supabase.from('users').insert({
      id: authData.user.id,
      school_id: schoolData.id,
      role: 'SCHOOL_ADMIN',
      full_name: admin.full_name,
      is_active: true,
    } as Record<string, unknown>);

    // 4. Create default academic year
    const currentYear = new Date().getFullYear().toString();
    const { data: academicYear } = await supabase
      .from('academic_years')
      .insert({
        school_id: schoolData.id,
        name: currentYear,
        is_current: true,
      } as Record<string, unknown>)
      .select('id')
      .single();

    // 5. Create current term
    if (academicYear) {
      await supabase.from('terms').insert({
        school_id: schoolData.id,
        academic_year_id: academicYear.id,
        name: 'Term1',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        is_current: true,
      } as Record<string, unknown>);
    }

    // 6. Create notification preferences
    await supabase.from('notification_preferences').insert({
      school_id: schoolData.id,
    } as Record<string, unknown>);

    // 7. Audit log
    await supabase.from('audit_logs').insert({
      school_id: schoolData.id,
      user_id: authData.user.id,
      action: 'SCHOOL_CREATED',
      entity_type: 'school',
      entity_id: schoolData.id,
      new_value: { name: school.name, plan },
    } as Record<string, unknown>);

    // 8. Send welcome email
    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://skuli.app'}/login`;
      await sendWelcomeEmail(admin.email, school.name, admin.full_name, loginUrl);
    } catch {
      // Don't fail onboarding if email fails
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
