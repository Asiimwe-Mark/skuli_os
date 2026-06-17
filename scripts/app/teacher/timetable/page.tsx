'use client';

/**
 * app/teacher/timetable/page.tsx
 * AP-1 fix: useEffect+createBrowserClient+fetch → useQuery
 * AP-2 fix: no direct supabase browser client — user comes from session hook
 * AP-6 fix: print handler in useCallback
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Printer, Loader2, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

interface Period {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
}

interface Slot {
  id: string;
  day_of_week: number;
  period: Period | null;
  subject: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  room: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const json = await res.json();
  return (json.data ?? json) as T;
}

export default function TeacherTimetablePage() {
  // AP-1 fix: parallel useQuery — no supabase.auth.getUser() in useEffect
  // The slots API is scoped to the authenticated user server-side
  const { data: slots = [], isLoading: slotsLoading, isError: slotsError, refetch } = useQuery<Slot[]>({
    queryKey: ['teacher-timetable-slots'],
    queryFn: () => fetchJson<Slot[]>('/api/timetable/slots'),
    staleTime: 5 * 60_000,
  });

  const { data: periods = [], isLoading: periodsLoading } = useQuery<Period[]>({
    queryKey: ['timetable-periods'],
    queryFn: () => fetchJson<Period[]>('/api/timetable/periods'),
    staleTime: 10 * 60_000,
  });

  const isLoading = slotsLoading || periodsLoading;

  // AP-6 fix: stable callback
  const handlePrint = useCallback(() => window.print(), []);

  // AP-7 fix: memoize grid construction
  const grid = useMemo(() => {
    const g = new Map<string, Map<number, Slot>>();
    for (const p of periods) g.set(p.id, new Map());
    for (const s of slots) {
      if (s.period) g.get(s.period.id)?.set(s.day_of_week, s);
    }
    return g;
  }, [slots, periods]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-warning-600" />
      </div>
    );
  }

  if (slotsError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <WifiOff className="h-10 w-10 text-muted" />
        <p className="text-muted text-sm">Could not load timetable.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Timetable">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Timetable</h1>
            <p className="text-muted">Your weekly teaching schedule</p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print Timetable
          </Button>
        </div>

        {periods.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Clock className="h-12 w-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No timetable periods configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-bg-tertiary">
                    <th className="py-3 px-4 text-left font-medium text-muted min-w-[120px]">Period</th>
                    {DAYS.map((day) => (
                      <th key={day} className="py-3 px-4 text-left font-medium text-muted min-w-[150px]">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 px-4">
                          <div className="font-medium">{p.name}</div>
                          {p.start_time && p.end_time && (
                            <div className="text-xs text-muted">{p.start_time} – {p.end_time}</div>
                          )}
                        </td>
                        {DAYS.map((_, dayIndex) => {
                          const dayNum = dayIndex + 1;
                          const slot = grid.get(p.id)?.get(dayNum);
                          return (
                            <td key={`${p.id}-${dayNum}`} className="py-3 px-4">
                              {slot ? (
                                <div className="p-2 rounded-lg bg-bg-tertiary border border-border">
                                  <p className="font-medium text-heading text-xs">{slot.subject?.name ?? '-'}</p>
                                  <p className="text-[11px] text-warning-600">{slot.class?.name ?? ''}</p>
                                  {slot.room && <p className="text-[10px] text-muted">{slot.room}</p>}
                                </div>
                              ) : (
                                <div className="text-muted text-xs">—</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
