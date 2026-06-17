'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseBrowser } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Loader2, AlertCircle, WifiOff, RefreshCw } from 'lucide-react';
import type { AttendanceStatus } from '@/types';
import { useSearchParams } from 'next/navigation';

interface StudentEntry {
  student_id: string;
  full_name: string;
  admission_number: string;
}

interface PendingAttendance {
  classId: string;
  className: string;
  date: string;
  records: [string, AttendanceStatus][];
  queuedAt: string;
}

const PENDING_STORAGE_KEY = 'skuli-pending-attendance';

const STATUS_CONFIG: Record<
  AttendanceStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  present: {
    label: 'Present',
    shortLabel: 'P',
    color: 'text-secondary',
    bgColor: 'bg-success-50',
    borderColor: 'border-success-100',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    color: 'text-secondary',
    bgColor: 'bg-danger-50',
    borderColor: 'border-danger-100',
  },
  late: {
    label: 'Late',
    shortLabel: 'L',
    color: 'text-secondary',
    bgColor: 'bg-warning-50',
    borderColor: 'border-warning-100',
  },
  excused: {
    label: 'Excused',
    shortLabel: 'E',
    color: 'text-secondary',
    bgColor: 'bg-bg-tertiary',
    borderColor: 'border-border',
  },
};

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
}

function getPendingCount(): number {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '[]');
    return pending.length;
  } catch {
    return 0;
  }
}

function dispatchPendingChange() {
  window.dispatchEvent(new CustomEvent('pending-attendance-changed'));
}

export default function TeacherAttendancePage() {
  const { school, currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [selectedClassId, setSelectedClassId] = useState(searchParams.get('classId') || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [submitResults, setSubmitResults] = useState<Map<string, 'saving' | 'saved' | 'error'>>(new Map());

  // Offline state
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLockRef = useRef(false);

  // Online/offline detection + sync on reconnect
  useEffect(() => {
    setPendingCount(getPendingCount());

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSubmissions();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function syncPendingSubmissions() {
    if (syncLockRef.current) return;
    const pending: PendingAttendance[] = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '[]');
    if (pending.length === 0) return;

    syncLockRef.current = true;
    setIsSyncing(true);
    let totalSynced = 0;
    const failedBatches: PendingAttendance[] = [];

    for (const batch of pending) {
      try {
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            class_id: batch.classId,
            date: batch.date,
            records: batch.records.map(([studentId, status]) => ({
              student_id: studentId,
              status,
            })),
          }),
        });
        if (response.ok) {
          totalSynced += batch.records.length;
        } else {
          failedBatches.push(batch);
        }
      } catch {
        failedBatches.push(batch);
      }
    }

    // Re-queue failed batches, clear successful ones
    if (failedBatches.length > 0) {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(failedBatches));
    } else {
      localStorage.removeItem(PENDING_STORAGE_KEY);
    }
    setPendingCount(failedBatches.length);
    dispatchPendingChange();
    setIsSyncing(false);
    syncLockRef.current = false;

    if (totalSynced > 0) {
      toast({
        title: 'Attendance Synced',
        description: `${totalSynced} offline record${totalSynced !== 1 ? 's' : ''} synced successfully${failedBatches.length ? `. ${failedBatches.length} batch${failedBatches.length !== 1 ? 'es' : ''} failed - will retry.` : '.'}`,
      });
    } else if (failedBatches.length > 0) {
      toast({
        title: 'Sync Failed',
        description: 'Could not sync offline attendance. Will retry when connection improves.',
        variant: 'destructive',
      });
    }

    queryClient.invalidateQueries({ queryKey: ['attendance-students'] });
  }

  // Fetch teacher's assignments via API (SW-cached for offline)
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['teacher-assignments', school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const res = await fetch('/api/attendance/class-list');
      if (!res.ok) {
        // Fallback to direct Supabase if API fails
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const { data, error } = await supabase
          .from('teacher_class_assignments')
          .select(`
            class_id,
            subject_id,
            is_class_teacher,
            class:classes(id, name, stream)
          `)
          .eq('teacher_id', user.id)
          .eq('is_deleted', false);
        if (error) throw error;
        return data || [];
      }
      const json = await res.json();
      // Map API response to Assignment shape for homeroom classes
      return (json.data?.classes || []).map((c: any) => ({
        class_id: c.classId,
        subject_id: null,
        is_class_teacher: true,
        class: { name: c.className, stream: c.stream },
      }));
    },
  });

  const homeroomClasses = assignments.filter((a) => a.is_class_teacher);

  useEffect(() => {
    if (homeroomClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(homeroomClasses[0].class_id);
    }
  }, [homeroomClasses, selectedClassId]);

  // Load students + existing attendance
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['attendance-students', selectedClassId, selectedDate, currentTerm?.id],
    queryFn: async () => {
      const { data: enrollments, error: enrollErr } = await supabase
        .from('class_enrollments')
        .select('student_id, students(id, full_name, admission_number)')
        .eq('class_id', selectedClassId)
        .eq('term_id', currentTerm!.id);
      if (enrollErr) throw enrollErr;

      const { data: existing } = await supabase
        .from('attendance_records')
        .select('student_id, status')
        .eq('class_id', selectedClassId)
        .eq('date', selectedDate);

      const existingMap = new Map<string, AttendanceStatus>(
        (existing || []).map((r: { student_id: string; status: string }) => [
          r.student_id,
          r.status as AttendanceStatus,
        ])
      );

      const list: StudentEntry[] = (enrollments || []).map((e: any) => ({
        student_id: e.student_id,
        full_name: e.students?.full_name || 'Unknown',
        admission_number: e.students?.admission_number || '',
      }));

      const initialAttendance = new Map<string, AttendanceStatus>();
      list.forEach((s) => {
        if (existingMap.has(s.student_id)) {
          initialAttendance.set(s.student_id, existingMap.get(s.student_id)!);
        } else {
          initialAttendance.set(s.student_id, 'present');
        }
      });

      setLocalAttendance(initialAttendance);
      return list;
    },
    enabled: !!selectedClassId && !!currentTerm?.id,
  });

  const handleTap = useCallback((studentId: string, status: AttendanceStatus) => {
    setLocalAttendance((prev) => new Map(prev).set(studentId, status));
  }, []);

  const handleSubmitAll = async () => {
    const entries = Array.from(localAttendance.entries());
    const className = homeroomClasses.find((c) => c.class_id === selectedClassId)?.class?.name || 'Unknown';

    if (!isOnline) {
      // Queue locally
      const existing: PendingAttendance[] = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '[]');
      existing.push({
        classId: selectedClassId,
        className,
        date: selectedDate,
        records: entries,
        queuedAt: new Date().toISOString(),
      });
      try {
        localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(existing));
        setPendingCount(existing.length);
        dispatchPendingChange();
      } catch {
        toast({
          title: 'Storage Full',
          description: 'Could not save attendance offline. Please free up browser storage and try again.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Saved Offline',
        description: `Attendance for ${className} will sync when you reconnect.`,
      });
      return;
    }

    // Online submit - batch format matching takeAttendanceSchema
    setSubmitResults(new Map(entries.map(([id]) => [id, 'saving'])));

    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: selectedClassId,
        date: selectedDate,
        records: entries.map(([studentId, status]) => ({
          student_id: studentId,
          status,
        })),
      }),
    });

    const newResults = new Map<string, 'saving' | 'saved' | 'error'>();
    const resultStatus = response.ok ? 'saved' : 'error';
    entries.forEach(([studentId]) => {
      newResults.set(studentId, resultStatus);
    });
    setSubmitResults(newResults);

    if (response.ok) {
      toast({
        title: 'Attendance Submitted',
        description: `${entries.length} records saved successfully.`,
      });
    } else {
      toast({
        title: 'Submission Failed',
        description: 'Server rejected attendance. Please try again.',
        variant: 'destructive',
      });
    }

    queryClient.invalidateQueries({ queryKey: ['attendance-students'] });

    // Clear results after 3s so button re-enables
    setTimeout(() => setSubmitResults(new Map()), 3000);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  if (!homeroomClasses.length) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={AlertCircle}
          title="No Homeroom Class Assigned"
          description="You can only take attendance for your homeroom class. Please contact your administrator."
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary mb-2">Take Attendance</h1>
        <p className="text-muted">Mark attendance for your homeroom class.</p>
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border-2 border-warning-100 bg-warning-50 px-4 py-3 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
          <WifiOff className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            You are offline. Attendance will be saved locally and synced when you reconnect.
          </p>
        </div>
      )}

      {/* Syncing indicator */}
      {isSyncing && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border-2 border-border bg-bg-tertiary px-4 py-3 text-muted">
          <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
          <p className="text-sm font-medium">
            Syncing offline attendance...
          </p>
        </div>
      )}

      {/* Pending sync count */}
      {pendingCount > 0 && !isSyncing && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border-2 border-warning-100 bg-warning-50 px-4 py-3 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
          <Clock className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            {pendingCount} pending attendance batch{pendingCount !== 1 ? 'es' : ''} waiting to sync
          </p>
        </div>
      )}

      {/* Class and Date Selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                {homeroomClasses.map((a) => (
                  <option key={a.class_id} value={a.class_id}>
                    {a.class?.name}
                    {a.class?.stream ? ` - ${a.class.stream}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full p-2 border rounded-md"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Students Grid */}
      {loadingStudents ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No Students Found"
          description="There are no students enrolled in this class for the current term."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            {students.map((student) => {
              const status = localAttendance.get(student.student_id) || 'present';
              const config = STATUS_CONFIG[status];
              const submitStatus = submitResults.get(student.student_id);

              return (
                <Card
                  key={student.student_id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    config.bgColor,
                    config.borderColor,
                    'border-2'
                  )}
                  onClick={() => handleTap(student.student_id, status)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-sm">{student.full_name}</p>
                        <p className="text-xs text-muted">{student.admission_number}</p>
                      </div>
                      <Badge className={cn('text-white', config.bgColor.replace('/20', ''), config.color.replace('text-', 'bg-'))}>
                        {config.shortLabel}
                      </Badge>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
                        const cfg = STATUS_CONFIG[s];
                        const isActive = status === s;
                        return (
                          <button
                            key={s}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTap(student.student_id, s);
                            }}
                            className={cn(
                              'flex-1 py-1 text-xs rounded transition-colors',
                              isActive ? cfg.bgColor : 'bg-bg-tertiary hover:bg-card-hover'
                            )}
                          >
                            {cfg.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    {submitStatus && (
                      <div className="mt-2 flex items-center gap-1 text-xs">
                        {submitStatus === 'saving' && (
                          <Loader2 className="w-3 h-3 animate-spin text-warning-600" />
                        )}
                        {submitStatus === 'saved' && (
                          <CheckCircle2 className="w-3 h-3 text-success-600" />
                        )}
                        {submitStatus === 'error' && (
                          <XCircle className="w-3 h-3 text-danger-600" />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Summary and Submit */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex flex-wrap gap-3 sm:gap-4">
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                    const count = Array.from(localAttendance.values()).filter(
                      (s) => s === status
                    ).length;
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <Badge className={cn('text-white', config.bgColor.replace('/20', ''))}>
                          {config.shortLabel}
                        </Badge>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <Button onClick={handleSubmitAll} disabled={submitResults.size > 0 || isSyncing}>
                  {!isOnline ? (
                    <>
                      <WifiOff className="w-4 h-4 mr-2" />
                      Save Offline
                    </>
                  ) : submitResults.size > 0 ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Submit Attendance
                    </>
                  )}
                </Button>
              </div>

              {submitResults.size > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-2">Submit Results:</p>
                  <div className="flex gap-4">
                    <span className="text-success-600">
                      Saved: {Array.from(submitResults.values()).filter((v) => v === 'saved').length}
                    </span>
                    <span className="text-danger-600">
                      Errors: {Array.from(submitResults.values()).filter((v) => v === 'error').length}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
