"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { useSchoolStore } from "@/store/school";
import { useUIStore } from "@/store/ui";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { motion } from "framer-motion";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overrideSchoolId = searchParams.get("school_id");
  const supabase = createBrowserClient();
  const { setSchool, setUser, setCurrentTerm, setCurrentAcademicYear, setLoading } =
    useSchoolStore();
  const { sidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen } = useUIStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      try {
        // Middleware already validated auth and role — just load the user profile
        const { data: { session } } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session?.user) {
          router.push("/login");
          return;
        }

        // Load user profile
        const { data: userProfile } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (cancelled) return;

        if (!userProfile || !userProfile.is_active) {
          router.push("/login");
          return;
        }

        setUser(userProfile);

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
      {/* Mobile sidebar backdrop */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}

      <Sidebar />
      <Topbar />
      <CommandPalette />
      <main
        className={cn(
          "pt-4 pb-8 px-4 lg:px-6 transition-all duration-300",
          sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[260px]"
        )}
      >
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
