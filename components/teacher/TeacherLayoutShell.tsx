"use client";

import { useState } from "react";
import TeacherSidebar from "@/components/teacher/TeacherSidebar";
import { TeacherTopbar } from "@/components/teacher/TeacherTopbar";

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
    <div className="flex min-h-screen bg-background">
      <TeacherSidebar
        teacher={teacher}
        assignments={assignments}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col lg:ml-64">
        <TeacherTopbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
