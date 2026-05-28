'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import type { AttendanceStatus } from '@/types';
import { useSearchParams } from 'next/navigation';

interface StudentEntry {
  student_id: string;
  full_name: string;
  admission_number: string;
}

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
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/50',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
    borderColor: 'border-rose-500/50',
  },
  late: {
    label: 'Late',
    shortLabel: 'L',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/20',
    borderColor: 'border-amber-400/50',
  },
  excused: {
    label: 'Excused',
    shortLabel: 'E',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
  },
};

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
}

export default function TeacherAttendancePage() {
  const { school, currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [selectedClassId, setSelectedClassId] = useState(searchParams.get('classId') || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  // Local state — NOT saved until Submit is clicked
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [submitResults, setSubmitResults] = useState<Map<string, 'saving' | 'saved' | 'error'>>(new Map());

  // Fetch teacher's assignments (only homeroom classes can take attendance)
  const {  assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['teacher-assignments', school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const {  { user } } = await supabase.auth.getUser();
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
    },
  });

  // Filter to only homeroom classes
  const homeroomClasses = assignments.filter((a) => a.is_class_teacher);

  // Auto-select first homeroom class if none selected
  useEffect(() => {
    if (homeroomClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(homeroomClasses[0].class_id);
    }
  }, [homeroomClasses, selectedClassId]);

  // Load students + existing attendance
  const {  students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['attendance-students', selectedClassId, selectedDate, currentTerm?.id],
    queryFn: async () => {
      const {  enrollments, error: enrollErr } = await supabase
        .from('class_enrollments')
        .select('student_id, students(id, full_name, admission_number)')
        .eq('class_id', selectedClassId)
        .eq('term_id', currentTerm!.id);
      if (enrollErr) throw enrollErr;

      const {  existing } = await supabase
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

      // Initialize local attendance with existing records
      const initialAttendance = new Map<string, AttendanceStatus>();
      list.forEach((s) => {
        if (existingMap.has(s.student_id)) {
          initialAttendance.set(s.student_id, existingMap.get(s.student_id)!);
        } else {
          initialAttendance.set(s.student_id, 'present'); // Default to present
        }
      });

      setLocalAttendance(initialAttendance);
      return list;
    },
    enabled: !!selectedClassId && !!currentTerm?.id,
  });

  // On tap: instant local update, no API call
  const handleTap = useCallback((studentId: string, status: AttendanceStatus) => {
    setLocalAttendance((prev) => new Map(prev).set(studentId, status));
  }, []);

  // On submit: batch all changes
  const handleSubmitAll = async () => {
    const entries = Array.from(localAttendance.entries());
    setSubmitResults(new Map(entries.map(([id]) => [id, 'saving'])));

    const results = await Promise.allSettled(
      entries.map(([studentId, status]) =>
        fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            status,
            date: selectedDate,
            class_id: selectedClassId,
          }),
        })
      )
    );

    const newResults = new Map<string, 'saving' | 'saved' | 'error'>();
    entries.forEach(([studentId], i) => {
      newResults.set(studentId, results[i]?.status === 'fulfilled' ? 'saved' : 'error');
    });
    setSubmitResults(newResults);

    const successCount = Array.from(newResults.values()).filter((v) => v === 'saved').length;
    toast({
      title: 'Attendance Submitted',
      description: `${successCount}/${entries.length} records saved successfully.`,
    });

    // Invalidate queries to refresh
    queryClient.invalidateQueries({ queryKey: ['attendance-students'] });
  };

  const todayStr = new Date().toISOString().split('T')[0];

  if (!homeroomClasses.length) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertCircle}
          title="No Homeroom Class Assigned"
          description="You can only take attendance for your homeroom class. Please contact your administrator."
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Take Attendance</h1>
        <p className="text-gray-600">Mark attendance for your homeroom class.</p>
      </div>

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
                        <p className="text-xs text-gray-500">{student.admission_number}</p>
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
                              isActive ? cfg.bgColor : 'bg-gray-100 hover:bg-gray-200'
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
                          <Loader2 className="w-3 h-3 animate-spin text-amber" />
                        )}
                        {submitStatus === 'saved' && (
                          <CheckCircle2 className="w-3 h-3 text-emerald" />
                        )}
                        {submitStatus === 'error' && (
                          <XCircle className="w-3 h-3 text-rose" />
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
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-4">
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
                <Button onClick={handleSubmitAll} disabled={submitResults.size > 0}>
                  {submitResults.size > 0 ? (
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

              {/* Show submit results summary */}
              {submitResults.size > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-2">Submit Results:</p>
                  <div className="flex gap-4">
                    <span className="text-emerald">
                      Saved: {Array.from(submitResults.values()).filter((v) => v === 'saved').length}
                    </span>
                    <span className="text-rose">
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
