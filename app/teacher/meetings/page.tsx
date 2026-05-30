'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import {
  Calendar,
  Clock,
  UserCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  Phone,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Bell,
  MessageSquare,
} from 'lucide-react';
import type { MeetingSlot } from '@/types';

interface BookingData {
  id: string;
  student_id: string;
  parent_name: string;
  parent_phone: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  student?: { full_name: string } | null;
}

export default function TeacherMeetingsPage() {
  const supabase = createBrowserClient();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notifyVia, setNotifyVia] = useState<'in_app' | 'sms'>('in_app');

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setTeacherId(user.id);
    }
    getUser();
  }, [supabase]);

  const { data: slots = [], isLoading } = useQuery<MeetingSlot[]>({
    queryKey: ['teacher-meeting-slots', teacherId, selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/meetings/slots?teacher_id=${teacherId}&date=${selectedDate}`
      );
      if (!res.ok) throw new Error('Failed to fetch slots');
      return res.json();
    },
    enabled: !!teacherId && !!selectedDate,
  });

  const updateBooking = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: string }) => {
      const res = await fetch(`/api/meetings/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notify_via: notifyVia }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update booking');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-meeting-slots'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const goToPrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => setSelectedDate(new Date().toISOString().split('T')[0]);
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const pendingSlots = slots.filter((s) => {
    const b = Array.isArray(s.booking) ? s.booking[0] : s.booking;
    return b && b.status === 'pending';
  });
  const confirmedSlots = slots.filter((s) => {
    const b = Array.isArray(s.booking) ? s.booking[0] : s.booking;
    return b && b.status === 'confirmed';
  });
  const availableSlots = slots.filter((s) => !s.is_booked && !s.is_deleted);

  const notifyLabel = notifyVia === 'in_app' ? 'in-app notification' : 'SMS';

  const handleConfirm = (bookingId: string) => {
    updateBooking.mutate(
      { bookingId, status: 'confirmed' },
      {
        onSuccess: () => {
          toast({ title: 'Confirmed', description: `Meeting confirmed. Parent notified via ${notifyLabel}.` });
        },
      }
    );
  };

  const handleDecline = (bookingId: string) => {
    updateBooking.mutate(
      { bookingId, status: 'cancelled' },
      {
        onSuccess: () => {
          toast({ title: 'Declined', description: `Meeting declined. Parent notified via ${notifyLabel}.` });
        },
      }
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">My Meetings</h1>
        <p className="text-muted-foreground">
          Review meeting requests from parents and confirm your availability.
        </p>
      </div>

      {/* Date Navigation */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={goToPrevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-amber" />
              <span className="font-semibold text-lg">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              {!isToday && (
                <Button variant="ghost" size="sm" onClick={goToToday}>
                  Today
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={goToNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {slots.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-navy">{slots.length}</p>
              <p className="text-sm text-muted-foreground">Total Slots</p>
            </CardContent>
          </Card>
          <Card className={pendingSlots.length > 0 ? 'border-amber-300' : ''}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber">{pendingSlots.length}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald">{confirmedSlots.length}</p>
              <p className="text-sm text-muted-foreground">Confirmed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground/70">{availableSlots.length}</p>
              <p className="text-sm text-muted-foreground">Available</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notification Method */}
      {pendingSlots.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Notify parent via:</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={notifyVia === 'in_app' ? 'default' : 'outline'}
                  onClick={() => setNotifyVia('in_app')}
                  className={cn(
                    'gap-1.5',
                    notifyVia === 'in_app' && 'bg-emerald-600 hover:bg-emerald-700'
                  )}
                >
                  <Bell className="h-3.5 w-3.5" />
                  In-App
                </Button>
                <Button
                  size="sm"
                  variant={notifyVia === 'sms' ? 'default' : 'outline'}
                  onClick={() => setNotifyVia('sms')}
                  className={cn(
                    'gap-1.5',
                    notifyVia === 'sms' && 'bg-emerald-600 hover:bg-emerald-700'
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  SMS
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slots List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Meeting Slots"
          description="There are no meeting slots scheduled for this date. Contact your admin to generate slots."
        />
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => {
            const booking: BookingData | undefined = Array.isArray(slot.booking)
              ? slot.booking[0]
              : (slot.booking as BookingData | undefined);
            const isPending = booking?.status === 'pending';
            const isConfirmed = booking?.status === 'confirmed';
            const isUpdating = updateBooking.isPending;

            return (
              <Card
                key={slot.id}
                className={cn(
                  'border transition-all',
                  slot.is_deleted
                    ? 'border-border bg-navy-100 opacity-60'
                    : isPending
                    ? 'border-amber-300 bg-amber-50/30'
                    : isConfirmed
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-border'
                )}
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-lg">
                        {slot.start_time} — {slot.end_time}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ({slot.duration_minutes} min)
                      </span>
                      <Badge
                        variant={
                          slot.is_deleted
                            ? 'secondary'
                            : isPending
                            ? 'outline'
                            : isConfirmed
                            ? 'default'
                            : 'secondary'
                        }
                        className={cn(
                          isPending && 'border-amber-400 text-amber-700 bg-amber-100',
                          isConfirmed && 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        )}
                      >
                        {slot.is_deleted
                          ? 'Blocked'
                          : isPending
                          ? 'Pending Confirmation'
                          : isConfirmed
                          ? 'Confirmed'
                          : 'Available'}
                      </Badge>
                    </div>

                    {/* Action buttons for pending bookings */}
                    {isPending && booking && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleConfirm(booking.id)}
                          disabled={isUpdating}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(booking.id)}
                          disabled={isUpdating}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Booking details */}
                  {booking && !slot.is_deleted && (
                    <div className="mt-4 p-3 rounded-lg bg-surface border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <p className="text-xs text-muted-foreground">Student</p>
                            <p className="text-sm font-medium">
                              {booking.student?.full_name || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <p className="text-xs text-muted-foreground">Parent</p>
                            <p className="text-sm font-medium">
                              {booking.parent_name || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm font-medium">
                              {booking.parent_phone || '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                      {booking.notes && (
                        <div className="mt-3 flex items-start gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-sm">{booking.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
