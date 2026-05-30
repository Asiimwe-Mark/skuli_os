'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import Link from 'next/link';

const inviteSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['SCHOOL_ADMIN', 'BURSAR', 'TEACHER']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface Assignment {
  class_id: string;
  subject_id: string;
  is_class_teacher: boolean;
}

export default function InviteUserPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'TEACHER' },
  });

  const selectedRole = watch('role');

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then((r) => r.json()),
      fetch('/api/subjects').then((r) => r.json()),
    ]).then(([clsData, subData]) => {
      setClasses(clsData?.data ?? []);
      setSubjects(subData?.data ?? []);
    }).catch(() => {});
  }, []);

  async function onSubmit(data: InviteFormData) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          assignments: data.role === 'TEACHER' ? assignments : undefined,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        toast({ title: 'Invitation failed', description: result.error, variant: 'destructive' });
        return;
      }
      setSuccess(true);
      toast({ title: `Invitation sent to ${data.email}` });
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
    }
    setSubmitting(false);
  }

  function addAssignment() {
    setAssignments((prev) => [...prev, { class_id: '', subject_id: '', is_class_teacher: false }]);
  }

  function removeAssignment(index: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAssignment(index: number, field: keyof Assignment, value: any) {
    setAssignments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <UserPlus className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Invitation Sent</h2>
        <p className="text-gray-500">The user will receive an email with a link to set their password.</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => { setSuccess(false); }}>Invite Another</Button>
          <Link href="/dashboard/settings/users">
            <Button>Back to Users</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/settings/users" className="hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Users & Roles
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Invite User</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a New User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" {...register('full_name')} placeholder="John Doe" />
              {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} placeholder="john@school.com" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setValue('role', v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL_ADMIN">School Admin</SelectItem>
                  <SelectItem value="BURSAR">Bursar</SelectItem>
                  <SelectItem value="TEACHER">Teacher</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
            </div>

            {/* Teacher Assignments */}
            {selectedRole === 'TEACHER' && (
              <div className="space-y-3">
                <Label>Class Assignments</Label>
                {assignments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <Select value={a.class_id} onValueChange={(v) => updateAssignment(i, 'class_id', v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={a.subject_id} onValueChange={(v) => updateAssignment(i, 'subject_id', v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Homeroom Only</SelectItem>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={a.is_class_teacher}
                        onChange={(e) => updateAssignment(i, 'is_class_teacher', e.target.checked)}
                      />
                      Class Teacher
                    </label>
                    <Button variant="ghost" size="icon" onClick={() => removeAssignment(i)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addAssignment}>
                  <Plus className="h-4 w-4 mr-1" /> Add Assignment
                </Button>
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Send Invitation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
