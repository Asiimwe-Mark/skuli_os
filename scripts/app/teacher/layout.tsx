'use client';

import { useEffect, useState } from 'react';
import { useSupabaseBrowser } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import TeacherSidebar from '@/components/teacher/TeacherSidebar';
import { TeacherTopbar } from '@/components/teacher/TeacherTopbar';
import type { UserProfile, School } from '@/types';

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
  subject: { name: string } | null;
}

interface TeacherProfile {
  full_name: string;
  avatar_url: string | null;
  school_id: string | null;
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const supabase = useSupabaseBrowser();
  const store = useSchoolStore();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionResp } = await supabase.auth.getSession();
      const userId = sessionResp.session?.user?.id;
      if (cancelled) return;
      if (!userId) { window.location.href = '/login'; return; }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, school_id, role, full_name, is_active, phone, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        const isAuthErr = profileError.code === 'PGRST301' || /jwt|auth/i.test(profileError.message ?? '');
        if (isAuthErr) { window.location.href = '/login'; return; }
        store.setLoading(false);
        setError('Failed to load your profile. Please try again.');
        return;
      }

      if (!profile) { store.setLoading(false); window.location.href = '/login'; return; }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        store.setLoading(false);
        window.location.href = '/login?error=deactivated';
        return;
      }

      if (profile.role !== 'TEACHER') {
        const roleRedirects: Record<string, string> = {
          SUPER_ADMIN: '/admin', SCHOOL_ADMIN: '/dashboard', BURSAR: '/dashboard/fees',
          GROUP_ADMIN: '/group', PARENT: '/portal',
        };
        window.location.href = roleRedirects[profile.role] || '/login';
        return;
      }

      store.setUser(profile as UserProfile);
      store.setUserRole(profile.role);

      if (profile.school_id) {
        const { data: school } = await supabase
          .from('schools')
          .select('id, name, school_code, address, district, phone, email, logo_url, motto, school_type, subscription_status, subscription_plan')
          .eq('id', profile.school_id)
          .maybeSingle();
        if (school && !cancelled) store.setSchool(school as unknown as School);
      }

      const { data: assignmentData } = await supabase
        .from('teacher_class_assignments')
        .select(`
          class_id, subject_id, is_class_teacher,
          class:classes(name, stream),
          subject:subjects(name)
        `)
        .eq('teacher_id', userId)
        .eq('is_deleted', false);

      if (cancelled) return;

      setTeacher(profile as unknown as TeacherProfile);
      setAssignments((assignmentData || []) as Assignment[]);
      store.setLoading(false);
      setReady(true);
    }
    load();
    return () => { cancelled = true; };
  }, [supabase, store]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center">
            <span className="text-danger-600 text-xl font-bold">!</span>
          </div>
          <p className="text-heading font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-[3px] border-border border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!teacher) return null;

  return (
    <div className="flex min-h-screen">
      <TeacherSidebar
        teacher={teacher}
        assignments={assignments}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <TeacherTopbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-5 lg:p-6 xl:p-8">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
