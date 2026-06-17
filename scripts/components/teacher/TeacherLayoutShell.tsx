"use client";

import { useState } from "react";
import TeacherSidebar from "@/components/teacher/TeacherSidebar";
import { TeacherTopbar } from "@/components/teacher/TeacherTopbar";
import { OfflineBanner } from "@/components/shared/offline-banner";

interface Assignment {
  class_id: string;
  subject_id: string | null;
  is_class_teacher: boolean;
  class: { name: string; stream: string | null } | null;
  subject: { name: string } | null;
}

interface TeacherLayoutShellProps {
  children: React.ReactNode;
  teacher: {
    full_name: string;
    avatar_url: string | null;
    school_id: string | null;
  };
  assignments: Assignment[];
}

export function TeacherLayoutShell({ children, teacher, assignments }: TeacherLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen dark:">
      <TeacherSidebar
        teacher={teacher}
        assignments={assignments}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex flex-col lg:ml-64 overflow-x-hidden">
        <OfflineBanner />
        <TeacherTopbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
