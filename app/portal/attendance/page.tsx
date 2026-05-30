'use client';

import { useState, useEffect } from 'react';
import { usePortal } from '@/app/portal/PortalContext';
import { formatDate } from '@/lib/utils/dates';
import { CalendarCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({ present: 0, absent: 0, late: 0, excused: 0, rate: 0 });
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    if (!selectedStudentId) return;
    setLoading(true);
    fetch(`/api/portal/attendance?student_id=${selectedStudentId}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setRecords(data?.records ?? []);
        setSummary(data?.summary ?? { present: 0, absent: 0, late: 0, excused: 0, rate: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedStudentId]);

  if (portalLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  if (!selectedStudent) {
    return (
      <div className="p-6 text-center text-gray-500">No student selected.</div>
    );
  }

  // Build calendar days for current month
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun

  const recordMap = new Map<string, string>();
  for (const r of records) {
    recordMap.set(r.date, r.status);
  }

  const calendarDays: { date: Date; status: string | null }[] = [];
  // Pad start
  for (let i = 0; i < startDayOfWeek; i++) {
    const d = new Date(year, month, -(startDayOfWeek - 1 - i));
    calendarDays.push({ date: d, status: null });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const dateStr = date.toISOString().split('T')[0];
    calendarDays.push({ date, status: recordMap.get(dateStr) ?? null });
  }

  const statusColors: Record<string, string> = {
    present: 'bg-green-500',
    absent: 'bg-red-500',
    late: 'bg-amber-500',
    excused: 'bg-blue-500',
  };

  const absences = records.filter((r) => r.status === 'absent' || r.status === 'late');

  const rateColor = summary.rate >= 85 ? 'text-green-600 bg-green-50' : summary.rate >= 75 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-gray-500">
            {selectedStudent.student.first_name} {selectedStudent.student.last_name} &middot; {selectedStudent.student.class?.name ?? 'N/A'}
          </p>
        </div>
        {linkedStudents.length > 1 && (
          <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {linkedStudents.map((ls) => (
                <SelectItem key={ls.student_id} value={ls.student_id}>
                  {ls.student.first_name} {ls.student.last_name} — {ls.student.class?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{summary.present}</p>
            <p className="text-xs text-gray-500">Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{summary.absent}</p>
            <p className="text-xs text-gray-500">Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{summary.late}</p>
            <p className="text-xs text-gray-500">Late</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={`p-4 text-center rounded-lg ${rateColor}`}>
            <p className="text-2xl font-bold">{summary.rate}%</p>
            <p className="text-xs">Attendance Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Low attendance alert */}
      {summary.rate < 75 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-800">Low Attendance Alert</p>
              <p className="text-sm text-red-700">
                {selectedStudent.student.first_name} has attended {summary.rate}% of school days this term.
                Please contact the school if there are circumstances affecting attendance.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">&larr;</button>
            <CardTitle className="text-lg">
              {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </CardTitle>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">&rarr;</button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="font-medium text-gray-500 py-1">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              const isCurrentMonth = day.date.getMonth() === month;
              return (
                <div
                  key={i}
                  className={`relative p-2 rounded ${isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}`}
                >
                  <span>{day.date.getDate()}</span>
                  {day.status && isCurrentMonth && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${statusColors[day.status] ?? ''}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Present</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Absent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Late</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Excused</span>
          </div>
        </CardContent>
      </Card>

      {/* Absences table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Absences This Term</CardTitle>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No absences recorded this term</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
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
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
