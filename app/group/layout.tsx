"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const { setUser, setGroup, setUserRole, setLoading } = useSchoolStore();
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

      // Load user profile
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
      setUserRole(userProfile.role);

      if (userProfile.role !== "GROUP_ADMIN" && userProfile.role !== "SUPER_ADMIN") {
        router.push("/dashboard");
        return;
      }

      // Load group via group_admins join
      const { data: groupAdmin } = await supabase
        .from("group_admins")
        .select("group:school_groups(id, name, code)")
        .eq("user_id", authUser.id)
        .single();

      if (groupAdmin?.group) {
        const g = groupAdmin.group as unknown as { id: string; name: string; code: string };
        setGroup(g);
      }

      setLoading(false);
      setReady(true);
    }

    loadContext();
  }, [supabase, router, setUser, setGroup, setUserRole, setLoading]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading group portal...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      <Sidebar />
      <Topbar />
      <main className="pt-4 pb-8 px-6 ml-[260px] transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
