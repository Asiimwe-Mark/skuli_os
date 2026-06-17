import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse, getSupabaseAndUser, requireSchool, requireRole } from '@/lib/api-helpers';

const createDisciplineSchema = z.object({
  student_id: z.string().uuid(),
  incident_date: z.string().min(1),
  incident_type: z.enum([
    'verbal_warning',
    'written_warning',
    'detention',
    'suspension',
    'parent_called',
    'referred_to_head',
    'other',
  ]),
  description: z.string().min(10),
  action_taken: z.string().optional(),
  parent_notified: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'TEACHER']);

    const body = await request.json();
    const validation = createDisciplineSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid request data', 400);
    }

    const { student_id, incident_date, incident_type, description, action_taken, parent_notified } = validation.data;

    // Verify student belongs to this school
    const { data: student, error: studentError } = await ctx.supabase
      .from('students')
      .select('id')
      .eq('id', student_id)
      .eq('school_id', schoolId)
      .single();

    if (studentError || !student) {
      return errorResponse('Student not found in this school', 404);
    }

    // Create discipline record
    const { data: record, error: createError } = await ctx.supabase
      .from('discipline_records')
      .insert({
        student_id,
        school_id: schoolId,
        incident_date,
        incident_type,
        description,
        action_taken: action_taken || null,
        parent_notified,
        parent_notified_at: parent_notified ? new Date().toISOString() : null,
        recorded_by: ctx.user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Failed to create discipline record:', createError);
      return errorResponse('Failed to create discipline record', 500);
    }

    // Log audit trail
    await ctx.supabase.from('audit_logs').insert({
      action: 'discipline_record_created',
      entity_type: 'discipline_record',
      entity_id: record.id,
      user_id: ctx.user.id,
      school_id: schoolId,
      old_value: null,
      ip_address: null,
      new_value: {
        student_id,
        incident_type,
        incident_date,
        description,
      },
    });

    return successResponse(record);
  } catch (error) {
    console.error('Error creating discipline record:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const student_id = searchParams.get('student_id');

    if (!student_id) {
      return errorResponse('student_id is required', 400);
    }

    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'TEACHER', 'BURSAR']);

    // Verify student belongs to this school before fetching records
    const { data: student, error: studentError } = await ctx.supabase
      .from('students')
      .select('id')
      .eq('id', student_id)
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .single();

    if (studentError || !student) {
      return errorResponse('Student not found in this school', 404);
    }

    // Fetch discipline records for this student
    const { data: records, error: fetchError } = await ctx.supabase
      .from('discipline_records')
      .select(`
        id,
        incident_date,
        incident_type,
        description,
        action_taken,
        parent_notified,
        parent_notified_at,
        recorded_by:users(
          full_name
        )
      `)
      .eq('student_id', student_id)
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('incident_date', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch discipline records:', fetchError);
      return errorResponse('Failed to fetch discipline records', 500);
    }

    return successResponse({ records: records || [] });
  } catch (error) {
    console.error('Error fetching discipline records:', error);
    return errorResponse('Internal server error', 500);
  }
}
