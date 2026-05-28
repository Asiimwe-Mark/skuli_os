'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/types/database';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';

type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
type LinkedStudent = {
  student_id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    class_id: string | null;
    class: { id: string; name: string } | null;
    school: { id: string; name: string } | null;
  };
};

const EVENT_COLORS: Record<string, string> = {
  holiday: 'bg-red-500',
  exam: 'bg-amber-500',
  event: 'bg-blue-500',
  closure: 'bg-rose-500',
  meeting: 'bg-purple-500',
};

export default function PortalCalendarPage() {
  const supabase = createClientComponentClient<Database>();
  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchLinkedStudents();
  }, []);

  async function fetchLinkedStudents() {
    try {
      const { data, error } = await supabase
        .from('parent_students')
        .select(`
          student_id,
          student:students(
            id,
            first_name,
            last_name,
            class_id,
            class:classes(id, name),
            school:schools(id, name)
          )
        `)
        .eq('is_deleted', false);

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'No students found', description: 'No students linked to your account', variant: 'destructive' });
        return;
      }

      setLinkedStudents(data as unknown as LinkedStudent[]);
      setSelectedStudentId(data[0].student_id);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({ title: 'Error', description: 'Failed to load student data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedStudentId) {
      fetchEvents();
    }
  }, [selectedStudentId]);

  async function fetchEvents() {
    if (!selectedStudentId) return;

    try {
      // Get the selected student's class
      const studentData = linkedStudents.find(ls => ls.student_id === selectedStudentId);
      const classId = studentData?.student.class_id;

      // Fetch school-wide public events + class-specific public events
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          class:classes(id, name)
        `)
        .eq('is_public', true)
        .eq('is_deleted', false)
        .or(`class_id.is.null,class_id.eq.${classId}`)
        .order('event_date', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({ title: 'Error', description: 'Failed to load calendar events', variant: 'destructive' });
    }
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  function getEventsForDay(day: Date) {
    return events.filter(event => {
      const eventDate = new Date(event.event_date);
      const endDate = event.end_date ? new Date(event.end_date) : eventDate;
      return day >= eventDate && day <= endDate && !event.is_deleted;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedStudent = linkedStudents.find(ls => ls.student_id === selectedStudentId);

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">School Calendar</h1>
          <p className="text-muted-foreground">View school holidays, exams, and events</p>
        </div>
        {linkedStudents.length > 1 && (
          <div className="min-w-[250px]">
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select child" />
              </SelectTrigger>
              <SelectContent>
                {linkedStudents.map(ls => (
                  <SelectItem key={ls.student_id} value={ls.student_id}>
                    {ls.student.first_name} {ls.student.last_name} - {ls.student.class?.name || 'No class'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Month Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              >
                Next
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-medium p-2 text-muted-foreground">
                {day}
              </div>
            ))}
            {daysInMonth.map(day => {
              const dayEvents = getEventsForDay(day);

              return (
                <div
                  key={day.toISOString()}
                  className={`
                    min-h-[80px] p-2 border rounded
                    ${!isSameMonth(day, currentMonth) ? 'bg-muted/30 text-muted-foreground' : ''}
                    ${isToday(day) ? 'bg-primary/10 border-primary' : ''}
                  `}
                >
                  <div className={`text-sm mb-1 ${isToday(day) ? 'font-bold text-primary' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <div
                        key={event.id}
                        className={`text-xs px-1 py-0.5 rounded text-white truncate ${EVENT_COLORS[event.event_type]}`}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Event Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Object.entries(EVENT_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <Badge className={color}>{type}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
