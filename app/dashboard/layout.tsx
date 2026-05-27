"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const { setSchool, setUser, setCurrentTerm, setCurrentAcademicYear, setLoading } =
    useSchoolStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadContext() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

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

      if (!userProfile || !userProfile.is_active) {
        router.push("/login");
        return;
      }

      setUser(userProfile);

      if (userProfile.school_id) {
        // Load school
        const { data: school } = await supabase
          .from("schools")
          .select("*")
          .eq("id", userProfile.school_id)
          .single();

        if (school) setSchool(school);

        // Load current term
        const { data: term } = await supabase
          .from("terms")
          .select("*, academic_years(*)")
          .eq("school_id", userProfile.school_id)
          .eq("is_current", true)
          .single();

        if (term) {
          setCurrentTerm(term);
          if (term.academic_years) {
            setCurrentAcademicYear(term.academic_years);
          }
        }
      }

      setLoading(false);
      setReady(true);
    }

    loadContext();
  }, [supabase, router, setSchool, setUser, setCurrentTerm, setCurrentAcademicYear, setLoading]);

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
