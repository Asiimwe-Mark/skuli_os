'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Download, Printer, Loader2, X, Pencil } from 'lucide-react';
import type { Database } from '@/types/database';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';

type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'] & {
  class?: { id: string; name: string } | null;
};
type Class = Database['public']['Tables']['classes']['Row'];

const EVENT_COLORS: Record<string, string> = {
  holiday: 'bg-red-500',
  exam: 'bg-amber-500',
  event: 'bg-blue-500',
  closure: 'bg-rose-500',
  meeting: 'bg-purple-500',
};

export default function CalendarPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    event_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    event_type: 'event' as CalendarEvent['event_type'],
    affects_attendance: true,
    class_id: '',
    is_public: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [eventsRes, classesRes] = await Promise.all([
        supabase
          .from('calendar_events')
          .select(`
            *,
            class:classes(id, name)
          `)
          .eq('is_deleted', false)
          .order('event_date', { ascending: true }),
        supabase.from('classes').select('*').eq('is_deleted', false).order('name'),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (classesRes.error) throw classesRes.error;

      setEvents(eventsRes.data || []);
      setClasses(classesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load calendar', variant: 'destructive' });
    } finally {
      setLoading(false);
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

  async function handleAddEvent() {
    try {
      const session = await supabase.auth.getSession();
      const schoolId = session.data.session?.user.user_metadata?.school_id;

      if (!schoolId) {
        toast({ title: 'Error', description: 'School ID not found', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('calendar_events').insert({
        school_id: schoolId,
        title: newEvent.title,
        description: newEvent.description || null,
        event_date: newEvent.event_date,
        end_date: newEvent.end_date || null,
        event_type: newEvent.event_type,
        affects_attendance: newEvent.affects_attendance,
        class_id: newEvent.class_id || null,
        is_public: newEvent.is_public,
        created_by: session.data.session?.user.id,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Event added successfully' });
      setIsAddEventOpen(false);
      setNewEvent({
        title: '',
        description: '',
        event_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
        event_type: 'event',
        affects_attendance: true,
        class_id: '',
        is_public: true,
      });
      fetchData();
    } catch (error) {
      console.error('Error adding event:', error);
      toast({ title: 'Error', description: 'Failed to add event', variant: 'destructive' });
    }
  }

  async function handleDeleteEvent(eventId: string) {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({ is_deleted: true })
        .eq('id', eventId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Event deleted successfully' });
      fetchData();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({ title: 'Error', description: 'Failed to delete event', variant: 'destructive' });
    }
  }

  function startEditEvent(event: CalendarEvent) {
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      description: event.description || '',
      event_date: event.event_date,
      end_date: event.end_date || '',
      event_type: event.event_type,
      affects_attendance: event.affects_attendance,
      class_id: event.class_id || '',
      is_public: event.is_public,
    });
  }

  async function handleUpdateEvent() {
    if (!editingEvent) return;
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          title: newEvent.title,
          description: newEvent.description || null,
          event_date: newEvent.event_date,
          end_date: newEvent.end_date || null,
          event_type: newEvent.event_type,
          affects_attendance: newEvent.affects_attendance,
          class_id: newEvent.class_id || null,
          is_public: newEvent.is_public,
        })
        .eq('id', editingEvent.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Event updated successfully' });
      setEditingEvent(null);
      setNewEvent({
        title: '',
        description: '',
        event_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
        event_type: 'event',
        affects_attendance: true,
        class_id: '',
        is_public: true,
      });
      fetchData();
    } catch (error) {
      console.error('Error updating event:', error);
      toast({ title: 'Error', description: 'Failed to update event', variant: 'destructive' });
    }
  }

  async function handleExportPDF() {
    try {
      const response = await fetch(`/api/pdf/calendar?month=${format(currentMonth, 'yyyy-MM')}`);
      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const windowObj = window.open('', '_blank');
      if (windowObj) {
        windowObj.location.href = url;
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({ title: 'Error', description: 'Failed to export PDF', variant: 'destructive' });
    }
  }

  const upcomingEvents = events
    .filter(event => {
      const eventDate = new Date(event.event_date);
      const today = new Date();
      const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
      return eventDate >= today && eventDate <= twoWeeksFromNow && !event.is_deleted;
    })
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Academic Calendar</h1>
          <p className="text-muted-foreground">Manage holidays, exams, and school events</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Event</DialogTitle>
                <DialogDescription>Create a new calendar event</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Event title"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Event details"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event_date">Start Date</Label>
                    <Input
                      id="event_date"
                      type="date"
                      value={newEvent.event_date}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, event_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End Date (optional)</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={newEvent.end_date}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="event_type">Event Type</Label>
                  <Select value={newEvent.event_type} onValueChange={(val) => setNewEvent(prev => ({ ...prev, event_type: val as CalendarEvent['event_type'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="exam">Exam</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="closure">Closure</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="affects_attendance"
                    checked={newEvent.affects_attendance}
                    onCheckedChange={(checked) => setNewEvent(prev => ({ ...prev, affects_attendance: checked }))}
                  />
                  <Label htmlFor="affects_attendance">Affects Attendance Calculation</Label>
                </div>
                <div>
                  <Label htmlFor="class_id">Class (optional - leave empty for school-wide)</Label>
                  <Select value={newEvent.class_id} onValueChange={(val) => setNewEvent(prev => ({ ...prev, class_id: val }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="School-wide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">School-wide</SelectItem>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_public"
                    checked={newEvent.is_public}
                    onCheckedChange={(checked) => setNewEvent(prev => ({ ...prev, is_public: checked }))}
                  />
                  <Label htmlFor="is_public">Visible in Parent Portal</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddEventOpen(false)}>Cancel</Button>
                <Button onClick={handleAddEvent}>Add Event</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={!!editingEvent} onOpenChange={(open) => { if (!open) setEditingEvent(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Event</DialogTitle>
                <DialogDescription>Update the calendar event</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Event title"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Event details"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-event_date">Start Date</Label>
                    <Input
                      id="edit-event_date"
                      type="date"
                      value={newEvent.event_date}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, event_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-end_date">End Date (optional)</Label>
                    <Input
                      id="edit-end_date"
                      type="date"
                      value={newEvent.end_date}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-event_type">Event Type</Label>
                  <Select value={newEvent.event_type} onValueChange={(val) => setNewEvent(prev => ({ ...prev, event_type: val as CalendarEvent['event_type'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="exam">Exam</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="closure">Closure</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-affects_attendance"
                    checked={newEvent.affects_attendance}
                    onCheckedChange={(checked) => setNewEvent(prev => ({ ...prev, affects_attendance: checked }))}
                  />
                  <Label htmlFor="edit-affects_attendance">Affects Attendance Calculation</Label>
                </div>
                <div>
                  <Label htmlFor="edit-class_id">Class (optional - leave empty for school-wide)</Label>
                  <Select value={newEvent.class_id} onValueChange={(val) => setNewEvent(prev => ({ ...prev, class_id: val }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="School-wide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">School-wide</SelectItem>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-is_public"
                    checked={newEvent.is_public}
                    onCheckedChange={(checked) => setNewEvent(prev => ({ ...prev, is_public: checked }))}
                  />
                  <Label htmlFor="edit-is_public">Visible in Parent Portal</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingEvent(null)}>Cancel</Button>
                <Button onClick={handleUpdateEvent}>Update Event</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
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
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium p-2 text-muted-foreground">
                  {day}
                </div>
              ))}
              {daysInMonth.map(day => {
                const dayEvents = getEventsForDay(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <div
                    key={day.toISOString()}
                    className={`
                      min-h-[100px] p-2 border rounded cursor-pointer transition-colors
                      ${!isSameMonth(day, currentMonth) ? 'bg-muted/30 text-muted-foreground' : ''}
                      ${isToday(day) ? 'bg-primary/10 border-primary' : ''}
                      ${isSelected ? 'ring-2 ring-primary' : ''}
                      hover:bg-muted/50
                    `}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div className={`text-sm mb-1 ${isToday(day) ? 'font-bold text-primary' : ''}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map(event => (
                        <div
                          key={event.id}
                          className={`text-xs px-1 py-0.5 rounded text-white truncate ${EVENT_COLORS[event.event_type]}`}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Side Panel - Selected Day / Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Upcoming Events'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDate ? (
              <div className="space-y-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setSelectedDate(null)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear selection
                </Button>
                {getEventsForDay(selectedDate).length > 0 ? (
                  getEventsForDay(selectedDate).map(event => (
                    <div key={event.id} className="p-3 border rounded space-y-2">
                      <div className="flex justify-between items-start">
                        <Badge className={EVENT_COLORS[event.event_type]}>{event.event_type}</Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditEvent(event)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="font-medium">{event.title}</div>
                      {event.description && (
                        <div className="text-sm text-muted-foreground">{event.description}</div>
                      )}
                      {event.class && (
                        <div className="text-xs text-muted-foreground">Class: {event.class.name}</div>
                      )}
                      {!event.is_public && (
                        <div className="text-xs text-muted-foreground">Internal only</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No events for this day
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map(event => (
                    <div
                      key={event.id}
                      className="p-3 border rounded cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedDate(new Date(event.event_date))}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <Badge className={EVENT_COLORS[event.event_type]}>{event.event_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(event.event_date), 'MMM d')}
                        </span>
                      </div>
                      <div className="font-medium text-sm">{event.title}</div>
                      {event.class && (
                        <div className="text-xs text-muted-foreground">{event.class.name}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No upcoming events
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
