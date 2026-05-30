"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  GraduationCap,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/group", icon: LayoutDashboard },
  { label: "Schools", href: "/group/schools", icon: Building2 },
  { label: "Analytics", href: "/group/analytics", icon: BarChart3 },
  { label: "Settings", href: "/group/settings", icon: Settings },
];

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();
  const { setUser, setGroup, setUserRole, setLoading } = useSchoolStore();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      try {
        // Middleware already validated auth and role
        const {
          data: { session },
        } = await supabase.auth.getSession();

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

        if (!cancelled) {
          setUser(userProfile);
          setUserRole(userProfile.role);
        }

        // Load group admin info
        const { data: groupAdmin } = await supabase
          .from("group_admins")
          .select("group:school_groups(id, name, code)")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (groupAdmin?.group && !cancelled) {
          const g = groupAdmin.group as unknown as { id: string; name: string; code: string };
          setGroup(g);
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
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-navy border border-white/10 text-white/70 hover:text-white"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-64 bg-navy border-r border-white/10 flex flex-col z-40 transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-4 flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-amber" />
          <span className="text-lg font-bold text-white">
            SKULI <span className="text-xs text-amber">Group</span>
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-amber/15 text-amber"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-64 pt-4 pb-8 px-4 lg:px-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
