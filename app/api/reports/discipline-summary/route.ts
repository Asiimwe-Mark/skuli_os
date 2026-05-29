import { NextRequest } from 'next/server';
import { z } from 'zod';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { errorResponse, successResponse, getSupabaseAndUser, requireSchool, requireRole } from '@/lib/api-helpers';

const disciplineSummarySchema = z.object({
  student_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = disciplineSummarySchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Invalid request data', 400);
    }

    const { student_id } = validation.data;

    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'TEACHER', 'BURSAR']);

    // Fetch student details
    const { data: student, error: studentError } = await ctx.supabase
      .from('students')
      .select(`
        id,
        full_name,
        admission_number,
        class:classes(
          id,
          name
        ),
        school:schools(
          id,
          name,
          motto
        )
      `)
      .eq('id', student_id)
      .eq('school_id', schoolId)
      .single();

    if (studentError || !student) {
      return errorResponse('Student not found', 404);
    }

    // Fetch discipline records for this student
    const { data: records, error: recordsError } = await ctx.supabase
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

    if (recordsError) {
      return errorResponse('Failed to fetch discipline records', 500);
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const studentData = student as any;
    const className = studentData.class?.name || 'N/A';
    const schoolName = studentData.school?.name || 'Unknown School';
    const schoolMotto = studentData.school?.motto || '';

    let yPosition = 780;

    // Header
    page.drawText('DISCIPLINE RECORD SUMMARY', { x: 50, y: yPosition, size: 18, font: boldFont });
    yPosition -= 30;

    page.drawText(schoolName, { x: 50, y: yPosition, size: 14, font: boldFont });
    yPosition -= 20;

    if (schoolMotto) {
      page.drawText(schoolMotto, { x: 50, y: yPosition, size: 10, font: font });
      yPosition -= 25;
    }

    // Student Information
    page.drawText('Student Information', { x: 50, y: yPosition, size: 12, font: boldFont });
    yPosition -= 20;

    page.drawText(`Name: ${studentData.full_name}`, { x: 70, y: yPosition, size: 10, font: font });
    yPosition -= 15;

    page.drawText(`Admission Number: ${studentData.admission_number || 'N/A'}`, { x: 70, y: yPosition, size: 10, font: font });
    yPosition -= 15;

    page.drawText(`Class: ${className}`, { x: 70, y: yPosition, size: 10, font: font });
    yPosition -= 15;

    page.drawText(`Generated: ${new Date().toLocaleDateString('en-GB')}`, { x: 70, y: yPosition, size: 10, font: font });
    yPosition -= 30;

    // Discipline Records
    page.drawText('Discipline Records', { x: 50, y: yPosition, size: 12, font: boldFont });
    yPosition -= 20;

    if (!records || records.length === 0) {
      page.drawText('No discipline records found.', { x: 70, y: yPosition, size: 10, font: font });
      yPosition -= 20;
    } else {
      page.drawText(`Total Incidents: ${records.length}`, { x: 70, y: yPosition, size: 10, font: font });
      yPosition -= 25;

      // Table headers
      const headerY = yPosition;
      page.drawText('Date', { x: 70, y: headerY, size: 9, font: boldFont });
      page.drawText('Type', { x: 150, y: headerY, size: 9, font: boldFont });
      page.drawText('Description', { x: 250, y: headerY, size: 9, font: boldFont });
      page.drawText('Action Taken', { x: 400, y: headerY, size: 9, font: boldFont });
      page.drawText('Notified', { x: 520, y: headerY, size: 9, font: boldFont });

      yPosition -= 20;

      // Draw each record
      for (const record of records) {
        if (yPosition < 100) {
          // Add new page if running out of space
          const newPage = pdfDoc.addPage([595.28, 841.89]);
          yPosition = 780;

          // Redraw headers on new page
          newPage.drawText('Date', { x: 70, y: yPosition, size: 9, font: boldFont });
          newPage.drawText('Type', { x: 150, y: yPosition, size: 9, font: boldFont });
          newPage.drawText('Description', { x: 250, y: yPosition, size: 9, font: boldFont });
          newPage.drawText('Action Taken', { x: 400, y: yPosition, size: 9, font: boldFont });
          newPage.drawText('Notified', { x: 520, y: yPosition, size: 9, font: boldFont });
          yPosition -= 20;
        }

        const dateStr = new Date(record.incident_date).toLocaleDateString('en-GB');
        const typeStr = record.incident_type.replace('_', ' ').toUpperCase();
        const descStr = record.description.length > 35 ? record.description.substring(0, 35) + '...' : record.description;
        const actionStr = record.action_taken ? (record.action_taken.length > 30 ? record.action_taken.substring(0, 30) + '...' : record.action_taken) : '—';
        const notifiedStr = record.parent_notified ? 'Yes' : 'No';

        page.drawText(dateStr, { x: 70, y: yPosition, size: 8, font: font });
        page.drawText(typeStr, { x: 150, y: yPosition, size: 8, font: font });
        page.drawText(descStr, { x: 250, y: yPosition, size: 8, font: font });
        page.drawText(actionStr, { x: 400, y: yPosition, size: 8, font: font });
        page.drawText(notifiedStr, { x: 520, y: yPosition, size: 8, font: font });

        yPosition -= 20;
      }
    }

    // Footer
    const footerY = 50;
    page.drawText(`Generated by SKULI on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`, {
      x: 50,
      y: footerY,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Serialize and return PDF
    const pdfBytes = await pdfDoc.save();
    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="discipline-summary-${studentData.admission_number || student_id}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating discipline summary PDF:', error);
    return errorResponse('Internal server error', 500);
  }
}
