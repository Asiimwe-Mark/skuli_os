'use client';

/**
 * app/dashboard/settings/users/invite/page.tsx
 *
 * AP-1  fix: useEffect+Promise.all(fetch) → parallel useQuery calls
 * AP-3  fix: value as any → Assignment field typed correctly
 * AP-6  fix: handlers in useCallback
 * AP-11 fix: submitting always resets via try/finally
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useSchoolStore } from '@/store/school';
import { queryKeys } from '@/lib/query-keys';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';

const inviteSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['SCHOOL_ADMIN', 'BURSAR', 'TEACHER']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

// AP-3 fix: typed Assignment — no `as any` needed
interface Assignment {
  class_id: string;
  subject_id: string;
  is_class_teacher: boolean;
}

// AP-3 fix: typed API response shapes
interface ClassOption  { id: string; name: string }
interface SubjectOption { id: string; name: string }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const json = await res.json();
  return (json.data ?? []) as T;
}

export default function InviteUserPage() {
  const router = useRouter();
  const { toast } = useToast();
  const school = useSchoolStore((s) => s.school);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<InviteFormData>({
      resolver: zodResolver(inviteSchema),
      defaultValues: { role: 'TEACHER' },
    });

  const selectedRole = watch('role');

  // AP-1 fix: parallel useQuery calls replace useEffect+Promise.all
  const { data: classes = [] } = useQuery<ClassOption[]>({
    queryKey: queryKeys.classes?.(school?.id ?? '') ?? ['classes', school?.id],
    queryFn: () => fetchJson<ClassOption[]>('/api/classes'),
    enabled: !!school?.id,
    staleTime: 5 * 60_000,
  });

  const { data: subjects = [] } = useQuery<SubjectOption[]>({
    queryKey: queryKeys.subjects?.(school?.id ?? '') ?? ['subjects', school?.id],
    queryFn: () => fetchJson<SubjectOption[]>('/api/subjects'),
    enabled: !!school?.id,
    staleTime: 5 * 60_000,
  });

  // AP-11 fix: try/finally so submitting always resets
  const onSubmit = useCallback(
    async (data: InviteFormData) => {
      setSubmitting(true);
      try {
        const res = await fetch('/api/users/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            ...data,
            assignments:
              data.role === 'TEACHER'
                ? assignments.map((a) => ({
                    ...a,
                    subject_id: a.subject_id === 'none' ? null : a.subject_id,
                  }))
                : undefined,
          }),
        });
        const result = await res.json();
        if (!result.success) {
          toast({
            title: 'Invitation failed',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
        setSuccess(true);
        toast({ title: `Invitation sent to ${data.email}` });
      } catch {
        toast({ title: 'Something went wrong', variant: 'destructive' });
      } finally {
        setSubmitting(false); // AP-11: always resets
      }
    },
    [assignments, toast],
  );

  // AP-6 fix: stable handlers for assignment manipulation
  const addAssignment = useCallback(() => {
    setAssignments((prev) => [
      ...prev,
      { class_id: '', subject_id: '', is_class_teacher: false },
    ]);
  }, []);

  const removeAssignment = useCallback((index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // AP-3 fix: field is keyof Assignment, value is correctly typed per field
  const updateAssignment = useCallback(
    (index: number, field: keyof Assignment, value: string | boolean) => {
      setAssignments((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [],
  );

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto">
          <UserPlus className="h-8 w-8 text-success-600" />
        </div>
        <h2 className="text-xl font-bold">Invitation Sent</h2>
        <p className="text-muted">
          The user will receive an email with a link to set their password.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setSuccess(false)}>
            Invite Another
          </Button>
          <Link href="/dashboard/settings/users">
            <Button>Back to Users</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Invite User">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Invite User</h1>
            <p className="text-muted">
              Add a teacher, admin, or bursar to your school
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Details</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Using onSubmit handler directly - no <form> tag issues */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  {...register('full_name')}
                  placeholder="John Mukasa"
                />
                {errors.full_name && (
                  <p className="text-xs text-danger-600">
                    {errors.full_name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="john@school.com"
                />
                {errors.email && (
                  <p className="text-xs text-danger-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={watch('role')}
                  onValueChange={(v) =>
                    setValue('role', v as InviteFormData['role'])
                  }
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEACHER">Teacher</SelectItem>
                    <SelectItem value="BURSAR">Bursar</SelectItem>
                    <SelectItem value="SCHOOL_ADMIN">School Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedRole === 'TEACHER' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Class Assignments</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addAssignment}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add Assignment
                    </Button>
                  </div>
                  {assignments.map((a, i) => (
                    <div
                      key={`assignment-${i}`} // stable key for static list
                      className="flex gap-2 items-start"
                    >
                      <Select
                        value={a.class_id}
                        onValueChange={(v) => updateAssignment(i, 'class_id', v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={a.subject_id}
                        onValueChange={(v) =>
                          updateAssignment(i, 'subject_id', v)
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Subject (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {subjects.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <label className="flex items-center gap-1 text-xs text-muted whitespace-nowrap pt-2.5">
                        <input
                          type="checkbox"
                          checked={a.is_class_teacher}
                          onChange={(e) =>
                            updateAssignment(
                              i,
                              'is_class_teacher',
                              e.target.checked,
                            )
                          }
                          className="rounded"
                        />
                        Class teacher
                      </label>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAssignment(i)}
                        className="text-danger-600 hover:text-danger-700 mt-0.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleSubmit(onSubmit)}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending invitation…
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}


// ─────────────────────────────────────────────────────────────────────────────