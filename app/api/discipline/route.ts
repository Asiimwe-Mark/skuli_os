import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse, getSupabaseAndUser, requireSchool, requireRole } from '@/lib/api-helpers';

const createDisciplineSchema = z.object({
  student_id: z.string().uuid(),
  school_id: z.string().uuid(),
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
    const body = await request.json();
    const validation = createDisciplineSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid request data', 400, validation.error.errors);
    }

    const { student_id, school_id, incident_date, incident_type, description, action_taken, parent_notified } = validation.data;

    // Authenticate and authorize
    const { supabase, user } = await getSupabaseAndUser();
    await requireSchool(supabase, user.id);
    await requireRole(user, ['SCHOOL_ADMIN', 'TEACHER']);

    // Verify student belongs to this school
    const {  student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', student_id)
      .eq('school_id', school_id)
      .single();

    if (studentError || !student) {
      return errorResponse('Student not found in this school', 404);
    }

    // Create discipline record
    const {  record, error: createError } = await supabase
      .from('discipline_records')
      .insert({
        student_id,
        school_id,
        incident_date,
        incident_type,
        description,
        action_taken: action_taken || null,
        parent_notified,
        parent_notified_at: parent_notified ? new Date().toISOString() : null,
        recorded_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Failed to create discipline record:', createError);
      return errorResponse('Failed to create discipline record', 500);
    }

    // Log audit trail
    await supabase.from('audit_logs').insert({
      action: 'create',
      entity_type: 'discipline_record',
      entity_id: record.id,
      old_value: null,
      new_value: record,
      changed_by: user.id,
      school_id: school_id,
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

    // Authenticate and authorize
    const { supabase, user } = await getSupabaseAndUser();
    await requireSchool(supabase, user.id);
    await requireRole(user, ['SCHOOL_ADMIN', 'TEACHER', 'BURSAR']);

    // Fetch discipline records for this student
    const {  records, error: fetchError } = await supabase
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
          first_name,
          last_name
        )
      `)
      .eq('student_id', student_id)
      .eq('school_id', user.school_id)
      .eq('is_deleted', false)
      .order('incident_date', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch discipline records:', fetchError);
      return errorResponse('Failed to fetch discipline records', 500);
    }

    return successResponse({ records });
  } catch (error) {
    console.error('Error fetching discipline records:', error);
    return errorResponse('Internal server error', 500);
  }
}
