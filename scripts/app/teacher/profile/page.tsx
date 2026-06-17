import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PaymentOptionForm } from './PaymentOptionForm';

export default async function TeacherProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch teacher profile
  const { data: userProfile } = await supabase
    .from('users')
    .select('full_name, phone, avatar_url, school_id, created_at')
    .eq('id', user.id)
    .single();

  if (!userProfile) {
    redirect('/login');
  }

  // School-level cash payouts flag (controls helper text in the form)
  const { data: schoolRow } = await supabase
    .from('schools')
    .select('cash_on')
    .eq('id', userProfile.school_id ?? '')
    .maybeSingle();
  const schoolCashOn = (schoolRow as { cash_on?: boolean } | null)?.cash_on ?? true;

  // Fetch teacher's assignments
  const { data: assignments } = await supabase
    .from('teacher_class_assignments')
    .select(`
      class_id,
      subject_id,
      is_class_teacher,
      class:classes(id, name, stream),
      subject:subjects(id, name)
    `)
    .eq('teacher_id', user.id)
    .eq('is_deleted', false);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary mb-2">My Profile</h1>
        <p className="text-muted">View your profile and class assignments.</p>
      </div>

      {/* Profile Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src={userProfile.avatar_url || undefined} />
              <AvatarFallback>
                {userProfile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{userProfile.full_name}</h2>
              <p className="text-muted">{userProfile.phone || 'No phone number'}</p>
              <Badge className="mt-2 bg-bg-tertiary text-white">Teacher</Badge>
              <p className="text-xs text-muted mt-2">
                Joined {new Date(userProfile.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Class Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Class Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments && assignments.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {assignments.map((a: { class_id: string; subject_id: string | null; is_class_teacher: boolean; class: { name: string; stream: string | null } | null; subject: { name: string } | null }) => (
                <div
                  key={`${a.class_id}-${a.subject_id}`}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">
                      {a.class?.name}
                      {a.class?.stream ? ` - ${a.class.stream}` : ''}
                    </span>
                    {a.is_class_teacher && (
                      <Badge className="bg-warning-50 text-warning-600 text-xs">
                        Homeroom
                      </Badge>
                    )}
                  </div>
                  {a.subject && (
                    <p className="text-sm text-muted">Subject: {a.subject.name}</p>
                  )}
                  {!a.subject && a.is_class_teacher && (
                    <p className="text-sm text-muted">Class Teacher (all subjects)</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">No class assignments yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Payment method - self service. Updates staff_payment_profiles so the
          next salary is disbursed to the chosen channel. */}
      <div className="mt-6">
        <PaymentOptionForm
          userId={user.id}
          schoolId={userProfile.school_id}
          schoolCashOn={schoolCashOn}
        />
      </div>
    </div>
  );
}
