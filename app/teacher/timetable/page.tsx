'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { Clock, Printer, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface Slot {
  id: string;
  day_of_week: number;
  period: { id: string; name: string; start_time: string; end_time: string; sort_order: number } | null;
  subject: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  room: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TeacherTimetablePage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [periods, setPeriods] = useState<{ id: string; name: string; start_time: string; end_time: string; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [slotsRes, periodsRes] = await Promise.all([
        fetch(`/api/timetable/slots?teacher_id=${user.id}`),
        fetch('/api/timetable/periods'),
      ]);

      const { data: slotsData } = await slotsRes.json();
      const { data: periodsData } = await periodsRes.json();

      setSlots(slotsData ?? []);
      setPeriods(periodsData ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  // Build grid: period -> day -> slot
  const grid = new Map<string, Map<number, Slot>>();
  for (const p of periods) {
    grid.set(p.id, new Map());
  }
  for (const s of slots) {
    if (s.period) {
      grid.get(s.period.id)?.set(s.day_of_week, s);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Timetable</h1>
          <p className="text-muted-foreground">Your weekly teaching schedule</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" /> Print Timetable
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-100">
                <th className="py-3 px-4 text-left font-medium text-muted-foreground min-w-[120px]">Period</th>
                {DAYS.map((day) => (
                  <th key={day} className="py-3 px-4 text-left font-medium text-muted-foreground min-w-[150px]">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-3 px-4">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground/70">{p.start_time} - {p.end_time}</div>
                  </td>
                  {DAYS.map((_, dayIndex) => {
                    const dayNum = dayIndex + 1;
                    const slot = grid.get(p.id)?.get(dayNum);
                    return (
                      <td key={dayIndex} className="py-3 px-4">
                        {slot ? (
                          <div className="p-2 rounded-lg bg-amber/10 border border-amber/20">
                            <p className="font-medium text-foreground text-xs">{slot.subject?.name ?? '—'}</p>
                            <p className="text-[11px] text-amber">{slot.class?.name ?? ''}</p>
                            {slot.room && <p className="text-[10px] text-muted-foreground/70">{slot.room}</p>}
                          </div>
                        ) : (
                          <div className="text-muted-foreground/50 text-xs">—</div>
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
    </div>
  );
}
