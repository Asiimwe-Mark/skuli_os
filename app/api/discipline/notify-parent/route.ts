import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse, getSupabaseAndUser, requireSchool, requireRole } from '@/lib/api-helpers';
import { normalizePhone } from '@/lib/utils/phone';

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

    const student = record.student as any;
    const school = record.school as any;

    if (!student.parent_phone) {
      return errorResponse('Parent phone number not available', 400);
    }

    // Generate default message
    const defaultMessage = `Dear ${student.parent_name || 'Parent'}, we wish to inform you that ${student.full_name} had a disciplinary incident on ${new Date(record.incident_date).toLocaleDateString('en-GB')}: ${record.incident_type.replace('_', ' ')}. Please contact ${school.name} for details.`;

    const messageBody = message_override || defaultMessage;

    // Send SMS via Africa's Talking
    const smsPayload = {
      title: `Discipline Notice - ${student.full_name}`,
      message_body: messageBody,
      audience_type: 'manual_phones' as const,
      phone_numbers: [normalizePhone(student.parent_phone)],
      channels: { sms: true, in_app: false },
    };

    const smsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/communication/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smsPayload),
    });

    if (!smsResponse.ok) {
      const smsError = await smsResponse.json().catch(() => ({ error: 'Unknown SMS error' }));
      return errorResponse(`Failed to send SMS: ${smsError.error || 'Unknown error'}`, 500);
    }

    // Update record to mark parent as notified
    const { error: updateError } = await ctx.supabase
      .from('discipline_records')
      .update({
        parent_notified: true,
        parent_notified_at: new Date().toISOString(),
      })
      .eq('id', record_id);

    if (updateError) {
      console.error('Failed to update discipline record notification status:', updateError);
      // Don't fail the request since SMS was sent successfully
    }

    // Log audit trail
    await ctx.supabase.from('audit_logs').insert({
      action: 'parent_notified',
      entity_type: 'discipline_record',
      entity_id: record_id,
      old_value: { parent_notified: false },
      new_value: { parent_notified: true },
      changed_by: ctx.user.id,
      school_id: schoolId,
    });

    return successResponse({
      message: 'Parent notified successfully',
      notified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error notifying parent:', error);
    return errorResponse('Internal server error', 500);
  }
}
