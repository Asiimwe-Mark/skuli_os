'use client';

/**
 * app/teacher/assignments/page.tsx
 * AP-1 fix: useEffect+fetch → useQuery
 * AP-6 fix: handlers in useCallback
 * AP-7 fix: filtered list in useMemo
 * AP-11 fix: mutation handles loading state
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Loader2, BookOpen, Trash2, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { ErrorBoundary } from '@/components/error-boundary';
import { formatDate } from '@/lib/utils/dates';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  class_id: string;
  subject_id: string | null;
  class: { name: string } | null;
  subject: { name: string } | null;
  submission_count: number;
}

const schema = z.object({
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  due_date: z.string().min(1, 'Due date required'),
  class_id: z.string().min(1, 'Class required'),
  subject_id: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface ClassOption { id: string; name: string }
interface SubjectOption { id: string; name: string }

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const json = await res.json();
  return (json.data ?? json) as T;
}

export default function TeacherAssignmentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>('all');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // AP-1 fix: useQuery replaces 3× useEffect calls
  const { data: assignments = [], isLoading, isError, refetch } = useQuery<Assignment[]>({
    queryKey: ['teacher-assignments'],
    queryFn: () => apiFetch<Assignment[]>('/api/teacher/assignments'),
    staleTime: 60_000,
  });

  const { data: classes = [] } = useQuery<ClassOption[]>({
    queryKey: ['teacher-classes'],
    queryFn: () => apiFetch<ClassOption[]>('/api/teacher/classes'),
    staleTime: 5 * 60_000,
  });

  const { data: subjects = [] } = useQuery<SubjectOption[]>({
    queryKey: ['teacher-subjects'],
    queryFn: () => apiFetch<SubjectOption[]>('/api/teacher/subjects'),
    staleTime: 5 * 60_000,
  });

  // AP-7 fix: memoized filtered list
  const filtered = useMemo<Assignment[]>(() =>
    filterClass === 'all'
      ? assignments
      : assignments.filter((a) => a.class_id === filterClass),
    [assignments, filterClass]
  );

  // AP-11 fix: useMutation handles loading/error — no manual setSubmitting
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/teacher/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to create assignment');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Assignment created' });
      reset();
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['teacher-assignments'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/teacher/assignments/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      toast({ title: 'Assignment deleted' });
      qc.invalidateQueries({ queryKey: ['teacher-assignments'] });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  // AP-6 fix: stable callback references
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('Delete this assignment?')) deleteMutation.mutate(id);
  }, [deleteMutation]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-warning-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <WifiOff className="h-10 w-10 text-muted" />
        <p className="text-muted text-sm">Could not load assignments.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Assignments">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Assignments</h1>
            <p className="text-muted">Manage homework and classwork for your classes</p>
          </div>
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4 mr-1" />
            New Assignment
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><CardTitle>Create Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input {...register('title')} placeholder="e.g. Chapter 5 Exercises" />
                {errors.title && <p className="text-xs text-danger-600">{errors.title.message}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Class *</Label>
                  <select {...register('class_id')} className="w-full h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-border">
                    <option value="">Select class</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {errors.class_id && <p className="text-xs text-danger-600">{errors.class_id.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <select {...register('subject_id')} className="w-full h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-border">
                    <option value="">Any subject</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Due Date *</Label>
                <Input type="date" {...register('due_date')} />
                {errors.due_date && <p className="text-xs text-danger-600">{errors.due_date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <textarea
                  {...register('description')}
                  rows={3}
                  placeholder="Optional instructions for students…"
                  className="w-full px-3 py-2 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-border resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleSubmit((d) => createMutation.mutate(d))}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating…</>
                    : 'Create Assignment'}
                </Button>
                <Button variant="ghost" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Class filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterClass === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterClass('all')}
          >
            All Classes
          </Button>
          {classes.map((c) => (
            <Button
              key={c.id}
              variant={filterClass === c.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterClass(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-12 w-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No assignments yet. Create one above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const isExpanded = expandedId === a.id;
              const isOverdue = new Date(a.due_date) < new Date();
              return (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <button
                      onClick={() => handleToggle(a.id)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{a.title}</span>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                          <span>{a.class?.name}</span>
                          {a.subject && <><span>·</span><span>{a.subject.name}</span></>}
                          <span>·</span>
                          <span>Due {formatDate(a.due_date)}</span>
                          <span>·</span>
                          <span>{a.submission_count} submissions</span>
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {a.description && (
                          <p className="text-sm text-heading whitespace-pre-wrap">{a.description}</p>
                        )}
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(a.id)}
                            disabled={deleteMutation.isPending}
                            className="text-danger-600 hover:text-danger-700"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
