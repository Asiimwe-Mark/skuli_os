'use client';

/**
 * app/portal/meetings/page.tsx
 * AP-1 fix: 3× useEffect+fetch → 3 useQuery hooks from use-portal-data.ts
 * AP-6 fix: handlers in useCallback
 * AP-11 fix: useMutation handles loading/error
 */

import { useState, useCallback } from 'react';
import { usePortal } from '@/app/portal/PortalContext';
import { formatDate } from '@/lib/utils/dates';
import { CalendarDays, Loader2, WifiOff, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { usePortalMeetingTeachers, usePortalMeetingSlots, usePortalMeetings, useBookMeeting } from '@/hooks/use-portal-data';
import { ErrorBoundary } from '@/components/error-boundary';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function PortalMeetingsPage() {
  const { selectedStudentId, selectedStudent } = usePortal();
  const { toast } = useToast();

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // AP-1 fix: 3× useQuery replaces 3× useEffect+fetch
  const { data: teachers = [], isLoading: teachersLoading } = usePortalMeetingTeachers(selectedStudentId || undefined);
  const { data: slots = [], isLoading: slotsLoading } = usePortalMeetingSlots(
    selectedTeacherId ?? undefined, selectedStudentId || undefined
  );
  const { data: meetings = [], isLoading: meetingsLoading } = usePortalMeetings(selectedStudentId || undefined);
  const bookMeeting = useBookMeeting();

  // AP-6 fix: stable callbacks
  const handleSelectTeacher = useCallback((id: string) => {
    setSelectedTeacherId(id);
    setSelectedSlotId(null);
  }, []);

  const handleBook = useCallback(async () => {
    if (!selectedSlotId || !selectedStudentId) return;
    bookMeeting.mutate(
      { slot_id: selectedSlotId, student_id: selectedStudentId, notes: notes || undefined },
      {
        onSuccess: () => {
          toast({ title: 'Meeting booked successfully' });
          setSelectedTeacherId(null);
          setSelectedSlotId(null);
          setNotes('');
        },
        onError: (err: Error) => {
          toast({ title: 'Booking failed', description: err.message, variant: 'destructive' });
        },
      }
    );
  }, [selectedSlotId, selectedStudentId, notes, bookMeeting, toast]);

  if (!selectedStudent) {
    return <div className="p-6 text-center text-muted">No student selected.</div>;
  }

  const statusClass: Record<string, string> = {
    pending: 'bg-warning-100 text-warning-700',
    confirmed: 'bg-success-50 text-success-700',
    cancelled: 'bg-danger-50 text-danger-700',
  };

  return (
    <ErrorBoundary section="Meetings">
      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Teacher Meetings</h1>
          <p className="text-muted">Book a slot to meet with {selectedStudent.student.full_name}&apos;s teachers</p>
        </div>

        {/* Upcoming bookings */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Your Bookings</CardTitle></CardHeader>
          <CardContent>
            {meetingsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
            ) : meetings.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No meetings booked yet.</p>
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary">
                    <div>
                      <p className="font-medium text-sm">{m.teacher?.full_name}</p>
                      <p className="text-xs text-muted">
                        {formatDate(m.meeting_date)}
                        {m.slot && ` · ${m.slot.start_time} – ${m.slot.end_time}`}
                      </p>
                      {m.notes && <p className="text-xs text-muted mt-1">{m.notes}</p>}
                    </div>
                    <Badge className={statusClass[m.status] ?? ''}>{m.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Book new meeting */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Book a Meeting</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Pick teacher */}
            <div>
              <p className="text-sm font-medium mb-2">1. Select a teacher</p>
              {teachersLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((k) => <div key={`sk-teacher-${k}`} className="h-10 w-28 rounded-lg bg-bg-tertiary animate-pulse" />)}
                </div>
              ) : teachers.length === 0 ? (
                <p className="text-sm text-muted">No teachers available for meetings.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {teachers.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTeacher(t.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        selectedTeacherId === t.id
                          ? 'border-warning-200 bg-warning-50 text-warning-700'
                          : 'border-border bg-card hover:border-border-strong'
                      }`}
                    >
                      <UserCheck className="h-4 w-4" />
                      {t.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Pick slot */}
            {selectedTeacherId && (
              <div>
                <p className="text-sm font-medium mb-2">2. Select an available slot</p>
                {slotsLoading ? (
                  <div className="flex gap-2">
                    {[1, 2].map((k) => <div key={`sk-slot-${k}`} className="h-10 w-36 rounded-lg bg-bg-tertiary animate-pulse" />)}
                  </div>
                ) : slots.filter((s) => !s.is_booked).length === 0 ? (
                  <p className="text-sm text-muted">No available slots for this teacher.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots
                      .filter((s) => !s.is_booked)
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSlotId(s.id)}
                          className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            selectedSlotId === s.id
                              ? 'border-warning-200 bg-warning-50 text-warning-700'
                              : 'border-border bg-card hover:border-border-strong'
                          }`}
                        >
                          {DAY_NAMES[s.day_of_week]} · {s.start_time}–{s.end_time}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Notes + confirm */}
            {selectedSlotId && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">3. Add a note (optional)</p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What would you like to discuss?"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-border resize-none"
                  />
                </div>
                <Button onClick={handleBook} disabled={bookMeeting.isPending} className="w-full">
                  {bookMeeting.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Booking…</>
                    : <><CalendarDays className="h-4 w-4 mr-2" />Confirm Booking</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
