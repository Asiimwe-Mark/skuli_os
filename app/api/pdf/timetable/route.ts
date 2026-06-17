import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTimetablePDF } from '@/lib/pdf/timetable';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const classId = searchParams.get('classId');
  const yearId = searchParams.get('yearId');

  if (!classId || !yearId) {
    return NextResponse.json({ error: 'Missing classId or yearId' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Get user's school
    const { data: schoolIdData, error: schoolError } = await supabase.rpc('get_user_school_id');
    if (schoolError || !schoolIdData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const schoolId = schoolIdData as string;

    // Fetch school details
    const { data: school, error: schoolFetchError } = await supabase
      .from('schools')
      .select('name')
      .eq('id', schoolId)
      .single();

    if (schoolFetchError || !school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Fetch class details (scoped to school)
    const { data: classData, error: classFetchError } = await supabase
      .from('classes')
      .select('name')
      .eq('id', classId)
      .eq('school_id', schoolId)
      .single();

    if (classFetchError || !classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Fetch academic year details (scoped to school)
    const { data: yearData, error: yearFetchError } = await supabase
      .from('academic_years')
      .select('name')
      .eq('id', yearId)
      .eq('school_id', schoolId)
      .single();

    if (yearFetchError || !yearData) {
      return NextResponse.json({ error: 'Academic year not found' }, { status: 404 });
    }

    // Fetch periods
    const { data: periods, error: periodsError } = await supabase
      .from('timetable_periods')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('sort_order');

    if (periodsError) throw periodsError;

    // Fetch slots with details
    const { data: slotsData, error: slotsError } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        subject:subjects(id, name, color),
        teacher:users(id, full_name)
      `)
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('academic_year_id', yearId)
      .eq('is_deleted', false);

    if (slotsError) throw slotsError;

    const slots = (slotsData || []).map((s: any) => ({
      id: s.id,
      period_id: s.period_id,
      day_of_week: s.day_of_week,
      subject: s.subject,
      teacher: s.teacher,
      room: s.room,
    }));

    // Generate PDF
    const pdfBlob = await generateTimetablePDF(
      school.name,
      classData.name,
      yearData.name,
      periods || [],
      slots
    );

    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="timetable-${classData.name}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating timetable PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
