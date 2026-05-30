"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overrideSchoolId = searchParams.get("school_id");
  const supabase = createBrowserClient();
  const { setSchool, setUser, setCurrentTerm, setCurrentAcademicYear, setLoading } =
    useSchoolStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!authUser) {
          router.push("/login");
          return;
        }

        // Load user profile with school
        const { data: userProfile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (cancelled) return;

        if (!userProfile || !userProfile.is_active) {
          router.push("/login");
          return;
        }

        setUser(userProfile);

        // Role guard: redirect users who don't belong in /dashboard
        const allowedDashboardRoles = ["SCHOOL_ADMIN", "BURSAR"];
        if (!allowedDashboardRoles.includes(userProfile.role)) {
          const roleRedirects: Record<string, string> = {
            SUPER_ADMIN: "/admin",
            TEACHER: "/teacher",
            PARENT: "/portal",
            GROUP_ADMIN: "/group",
          };
          router.push(roleRedirects[userProfile.role] || "/login");
          return;
        }

        // Determine which school to load (GROUP_ADMIN can override via ?school_id=)
        const effectiveSchoolId = overrideSchoolId || userProfile.school_id;

        if (effectiveSchoolId) {
          // Load school
          const { data: school } = await supabase
            .from("schools")
            .select("*")
            .eq("id", effectiveSchoolId)
            .single();

          if (school && !cancelled) setSchool(school);

          // Load current term
          const { data: term } = await supabase
            .from("terms")
            .select("*, academic_years(*)")
            .eq("school_id", effectiveSchoolId)
            .eq("is_current", true)
            .single();

          if (term && !cancelled) {
            setCurrentTerm(term);
            if (term.academic_years) {
              setCurrentAcademicYear(term.academic_years);
            }
          }
        }

        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    }

    loadContext();
    return () => { cancelled = true; };
  }, [supabase, router, overrideSchoolId, setSchool, setUser, setCurrentTerm, setCurrentAcademicYear, setLoading]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      <Sidebar />
      <Topbar />
      <CommandPalette />
      <main className="pt-4 pb-8 px-6 ml-[260px] transition-all duration-300">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
