import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCalendarPDF } from '@/lib/pdf/calendar';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get('month'); // yyyy-MM format

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Missing or invalid month param (yyyy-MM)' }, { status: 400 });
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

    // Fetch events for the month
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${new Date(year, monthNum, 0).getDate()}`;

    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('school_id', schoolId)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true });

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Generate PDF
    const blob = await generateCalendarPDF(school.name, month, events || []);
    const buffer = await blob.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="calendar-${month}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Calendar PDF error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
