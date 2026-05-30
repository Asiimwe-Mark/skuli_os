'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { ClipboardList, BookOpen, CheckSquare, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface Assignment {
  id: string;
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { id: string; name: string; stream: string | null } | null;
  subject: { id: string; name: string } | null;
}

export default function TeacherAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch(`/api/teacher/assignments?teacher_id=${user.id}`);
      const { data } = await res.json();
      setAssignments(data ?? []);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Teaching Assignments</h1>
        <p className="text-muted-foreground">Classes and subjects assigned to you</p>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No assignments yet. Contact your administrator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{a.class?.name ?? 'Unknown Class'}</h3>
                  {a.is_class_teacher && (
                    <Badge className="bg-amber/10 text-amber">Class Teacher</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {a.subject?.name ?? 'Homeroom'}
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/teacher/marks?class_id=${a.class_id}${a.subject_id ? `&subject_id=${a.subject_id}` : ''}`}
                    className="flex items-center gap-1 text-xs text-amber hover:underline"
                  >
                    <BookOpen className="h-3 w-3" /> Enter Marks
                  </Link>
                  <Link
                    href={`/teacher/attendance?class_id=${a.class_id}`}
                    className="flex items-center gap-1 text-xs text-amber hover:underline"
                  >
                    <CheckSquare className="h-3 w-3" /> Take Attendance
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
