import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import TeacherSidebar from '@/components/teacher/TeacherSidebar';

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('role, school_id, full_name, avatar_url')
    .eq('id', user.id)
    .single();

  if (!userProfile || userProfile.role !== 'TEACHER') {
    redirect('/login');
  }

  const { data: assignments } = await supabase
    .from('teacher_class_assignments')
    .select(`
      class_id,
      subject_id,
      is_class_teacher,
      class:classes(name, stream),
      subject:subjects(name)
    `)
    .eq('teacher_id', user.id)
    .eq('is_deleted', false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <TeacherSidebar
        teacher={userProfile}
        assignments={assignments || []}
      />
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  );
}
