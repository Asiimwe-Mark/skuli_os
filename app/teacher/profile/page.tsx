import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">My Profile</h1>
        <p className="text-gray-600">View your profile and class assignments.</p>
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
                {userProfile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{userProfile.full_name}</h2>
              <p className="text-gray-500">{userProfile.phone || 'No phone number'}</p>
              <Badge className="mt-2 bg-navy text-white">Teacher</Badge>
              <p className="text-xs text-gray-400 mt-2">
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
              {assignments.map((a) => (
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
                      <Badge className="bg-amber/10 text-amber text-xs">
                        Homeroom
                      </Badge>
                    )}
                  </div>
                  {a.subject && (
                    <p className="text-sm text-gray-500">Subject: {a.subject.name}</p>
                  )}
                  {!a.subject && a.is_class_teacher && (
                    <p className="text-sm text-gray-500">Class Teacher (all subjects)</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No class assignments yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
