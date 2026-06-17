'use client';

/**
 * app/portal/attendance/page.tsx
 * AP-1 fix: useEffect+fetch → useQuery (usePortalAttendance hook)
 * AP-11 fix: no manual loading state — useQuery handles it
 * AP-12 fix: no cleanup needed — React Query cancels on unmount
 */

import { useState, useMemo } from 'react';
import { usePortal } from '@/app/portal/PortalContext';
import { formatDate } from '@/lib/utils/dates';
import { CalendarCheck, AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePortalAttendance } from '@/hooks/use-portal-data';
import { ErrorBoundary } from '@/components/error-boundary';

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes: string | null;
}

interface Summary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}

export default function PortalAttendancePage() {
  const { selectedStudentId, selectedStudent, linkedStudents, setSelectedStudentId, loading: portalLoading } = usePortal();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // AP-1 fix: useQuery replaces useEffect+setState+fetch
  const { data, isLoading, isError, refetch } = usePortalAttendance(selectedStudentId || undefined);

  const records: AttendanceRecord[] = (data as { records?: AttendanceRecord[] } | null)?.records ?? [];
  const summary: Summary = (data as { summary?: Summary } | null)?.summary ?? { present: 0, absent: 0, late: 0, excused: 0, rate: 0 };

  // AP-7 fix: memoize calendar computation
  const { calendarDays, absences } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();

    const recordMap = new Map<string, string>();
    for (const r of records) recordMap.set(r.date, r.status);

    const days: { date: Date; status: string | null }[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: new Date(year, month, -(startDayOfWeek - 1 - i)), status: null });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().split('T')[0];
      days.push({ date, status: recordMap.get(dateStr) ?? null });
    }

    return {
      calendarDays: days,
      absences: records.filter((r) => r.status === 'absent' || r.status === 'late'),
    };
  }, [records, currentMonth]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  if (portalLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-warning-600" /></div>;
  }
  if (!selectedStudent) {
    return <div className="p-6 text-center text-muted">No student selected.</div>;
  }
  if (isError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center px-4">
        <WifiOff className="h-10 w-10 text-muted" />
        <p className="text-muted text-sm">Could not load attendance.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    present: 'bg-success-400',
    absent: 'bg-danger-400',
    late: 'bg-warning-400',
    excused: 'bg-blue-400',
  };
  const rateColor = summary.rate >= 85 ? 'text-heading bg-card-hover' : summary.rate >= 75 ? 'text-heading bg-card-hover' : 'text-danger-600 bg-danger-50';

  return (
    <ErrorBoundary section="Attendance">
      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Attendance</h1>
            <p className="text-muted">{selectedStudent.student.full_name} — {selectedStudent.student.class?.name ?? 'N/A'}</p>
          </div>
          {linkedStudents.length > 1 && (
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {linkedStudents.map((ls) => (
                  <SelectItem key={ls.student_id} value={ls.student_id}>
                    {ls.student.full_name} — {ls.student.class?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-warning-600" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-success-600">{summary.present}</p><p className="text-xs text-muted">Present</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-danger-600">{summary.absent}</p><p className="text-xs text-muted">Absent</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-warning-600">{summary.late}</p><p className="text-xs text-muted">Late</p></CardContent></Card>
              <Card><CardContent className={`p-4 text-center rounded-lg ${rateColor}`}><p className="text-2xl font-bold">{summary.rate}%</p><p className="text-xs">Attendance Rate</p></CardContent></Card>
            </div>

            {summary.rate < 75 && (
              <Card className="border-danger-50 bg-danger-50">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-danger-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-danger-600">Low Attendance Alert</p>
                    <p className="text-sm text-danger-600">{selectedStudent.student.full_name} has attended {summary.rate}% of school days this term. Please contact the school if there are circumstances affecting attendance.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="px-2 py-1 text-sm hover:bg-card-hover rounded">←</button>
                  <CardTitle className="text-lg">{currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</CardTitle>
                  <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="px-2 py-1 text-sm hover:bg-card-hover rounded">→</button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="font-medium text-muted py-1">{d}</div>
                  ))}
                  {calendarDays.map((day, i) => {
                    const isCurrentMonth = day.date.getMonth() === month;
                    return (
                      <div key={`cal-${i}`} className={`relative p-2 rounded ${isCurrentMonth ? 'text-heading' : 'text-muted'}`}>
                        <span>{day.date.getDate()}</span>
                        {day.status && isCurrentMonth && (
                          <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${statusColors[day.status] ?? 'bg-muted'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted flex-wrap">
                  {Object.entries(statusColors).map(([status, color]) => (
                    <span key={status} className="flex items-center gap-1 capitalize">
                      <span className={`w-2 h-2 rounded-full ${color}`} /> {status}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Absences This Term</CardTitle></CardHeader>
              <CardContent>
                {absences.length === 0 ? (
                  <p className="text-center text-muted py-8">No absences recorded this term</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted">
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Day</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absences.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">{formatDate(r.date)}</td>
                            <td className="py-2 pr-4">{new Date(r.date).toLocaleDateString('en-GB', { weekday: 'long' })}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'absent' ? 'bg-danger-50 text-danger-600' : 'bg-warning-100 text-warning-700'}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="py-2 text-muted">{r.notes ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
