import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse, getSupabaseAndUser, requireSchool, requireRole, getErrorStatus } from '@/lib/api-helpers';
import { normalizePhone } from '@/lib/utils/phone';
import { getSchoolCredentials } from '@/lib/africas-talking/client';
import { sendSingleSms } from '@/lib/africas-talking/sms';

const notifyParentSchema = z.object({
  student_id: z.string().uuid(),
  record_id: z.string().uuid(),
  message_override: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = notifyParentSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid request data', 400);
    }

    const { student_id, record_id, message_override } = validation.data;

    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'TEACHER']);

    // Fetch discipline record with student and school details
    const { data: record, error: recordError } = await ctx.supabase
      .from('discipline_records')
      .select(`
        id,
        incident_date,
        incident_type,
        description,
        action_taken,
        student:students(
          id,
          full_name,
          parent_name,
          parent_phone
        ),
        school:schools(
          id,
          name
        )
      `)
      .eq('id', record_id)
      .eq('school_id', schoolId)
      .single();

    if (recordError || !record) {
      return errorResponse('Discipline record not found', 404);
    }

    const student = record.student as unknown as { id: string; full_name: string; parent_name: string | null; parent_phone: string | null } | null;
    const school = record.school as unknown as { id: string; name: string } | null;

    if (!student || !student.parent_phone) {
      return errorResponse('Parent phone number not available', 400);
    }

    // Generate default message
    const defaultMessage = `Dear ${student.parent_name || 'Parent'}, we wish to inform you that ${student.full_name} was involved in a ${record.incident_type} incident on ${record.incident_date}. ${record.description ? `Details: ${record.description}.` : ''} ${record.action_taken ? `Action taken: ${record.action_taken}.` : ''} Please contact the school for more information. Regards, ${school?.name || 'School'}`;

    const message = message_override || defaultMessage;
    const phone = normalizePhone(student.parent_phone);

    // Get school's Africa's Talking credentials and send SMS directly
    const credentials = await getSchoolCredentials(ctx.supabase, schoolId);
    if (!credentials) {
      return errorResponse('SMS is not configured. Please set up Africa\'s Talking credentials in Settings > API Keys.', 400);
    }

    const smsResult = await sendSingleSms(phone, message, credentials);

    // Log SMS
    await ctx.supabase.from('sms_logs').insert({
      school_id: schoolId,
      recipient_phone: phone,
      message_body: message,
      message_type: 'discipline_notification',
      status: smsResult.success ? 'sent' : 'failed',
      africa_talking_message_id: null,
      cost: null,
      related_entity_type: 'discipline_record',
      related_entity_id: record_id,
      sent_at: new Date().toISOString(),
    });

    // Update the discipline record notification status
    const { error: updateError } = await ctx.supabase
      .from('discipline_records')
      .update({ parent_notified: true, parent_notified_at: new Date().toISOString() })
      .eq('id', record_id);

    if (updateError) {
      console.error('Failed to update discipline record notification status:', updateError);
    }

    if (!smsResult.success) {
      return errorResponse(`Failed to send SMS: ${smsResult.error || 'Unknown error'}`, 500);
    }

    return successResponse({
      message: 'Parent notification sent successfully',
      smsId: smsResult.messageId,
    });
  } catch (error) {
    console.error('Error sending parent notification:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = getErrorStatus(error);
    return errorResponse(message, status);
  }
}
