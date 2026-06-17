"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Building2, BarChart3, Settings, LogOut,
  Menu, X, Sparkles, Users,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview",  href: "/group",             icon: LayoutDashboard },
  { label: "Schools",   href: "/group/schools",     icon: Building2 },
  { label: "Analytics", href: "/group/analytics",   icon: BarChart3 },
  { label: "Settings",  href: "/group/settings",    icon: Settings },
];

function Brand({ suffix = "Group" }: { suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-soft">
        <Users className="w-4 h-4 text-white" />
      </div>
      <div className="leading-tight">
        <span className="font-display text-lg font-bold tracking-tight block text-heading">SKULI</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
          <Sparkles className="h-2.5 w-2.5" /> {suffix}
        </span>
      </div>
    </div>
  );
}

function SidebarNav({ pathname, onItemClick }: { pathname: string; onItemClick?: () => void }) {
  return (
    <nav className="flex-1 p-3 space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              isActive
                ? "bg-brand-600 text-white shadow-soft dark:bg-brand-500"
                : "text-muted hover:bg-card-hover hover:text-heading"
            )}
          >
            <item.icon className={cn("w-4 h-4", isActive ? "text-white" : "")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabaseBrowser();
  const { user, setUser, setGroup, setUserRole, setLoading } = useSchoolStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      const { data: sessionResp } = await supabase.auth.getSession();
      const userId = sessionResp.session?.user?.id;
      if (cancelled) return;
      if (!userId) { router.push("/login"); return; }

      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, school_id, role, full_name, is_active, phone")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;

      if (profileError) {
        const isAuthErr =
          profileError.code === "PGRST301" ||
          /jwt|auth/i.test(profileError.message ?? "");
        if (isAuthErr) { router.push("/login"); return; }
        setLoading(false); setError("Failed to load your profile. Please try again."); return;
      }
      if (!userProfile) { setLoading(false); router.push("/login"); return; }
      if (!userProfile.is_active) { setLoading(false); setError("Your account has been deactivated. Contact your administrator."); return; }

      if (userProfile.role !== "GROUP_ADMIN" && userProfile.role !== "SUPER_ADMIN") {
        const roleRedirects: Record<string, string> = {
          SCHOOL_ADMIN: "/dashboard", BURSAR: "/dashboard/fees", TEACHER: "/teacher", PARENT: "/portal",
        };
        window.location.href = roleRedirects[userProfile.role] || "/login";
        return;
      }

      setUser(userProfile as any);
      setUserRole(userProfile.role!);

      if (userProfile.role === "SUPER_ADMIN") {
        const { data: firstGroup } = await supabase.from("school_groups").select("id, name, code").limit(1).maybeSingle();
        if (!cancelled && firstGroup) setGroup(firstGroup as unknown as { id: string; name: string; code: string });
      } else {
        const { data: groupAdmin } = await supabase
          .from("group_admins")
          .select("group:school_groups(id, name, code)")
          .eq("user_id", userId)
          .maybeSingle();
        if (!cancelled && groupAdmin?.group) {
          const g = groupAdmin.group as unknown as { id: string; name: string; code: string };
          setGroup(g);
        }
      }

      setLoading(false);
      setReady(true);
    }
    loadContext();
    return () => { cancelled = true; };
  }, [supabase, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center ring-1 ring-danger-100">
            <span className="text-danger-600 text-2xl font-bold">!</span>
          </div>
          <p className="text-heading font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm shadow-soft hover:bg-brand-700 transition-colors"
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full border-[3px] border-border border-t-brand-600 animate-spin" />
          <p className="text-muted text-sm font-medium">Loading group portal...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-secondary border-r border-border flex-col z-40">
        <div className="px-5 h-16 flex items-center border-b border-border">
          <Brand />
        </div>
        <SidebarNav pathname={pathname} />
        <div className="p-3 border-t border-border bg-bg-tertiary/60">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-tertiary text-heading text-xs font-bold shadow-soft">
              {user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "GA"}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate text-heading">{user?.full_name || "Group Admin"}</p>
              <span className="inline-block text-[9px] font-semibold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800">
                Group Admin
              </span>
            </div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-heading hover:bg-card-hover w-full transition-colors font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-64 max-w-[85vw] bg-card border-r border-border flex flex-col z-40 lg:hidden shadow-pop"
          >
            <div className="px-5 h-16 flex items-center justify-between border-b border-border">
              <Brand />
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-heading hover:bg-card-hover transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNav pathname={pathname} onItemClick={() => setSidebarOpen(false)} />
            <div className="p-3 border-t border-border">
              <button
                onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-heading hover:bg-card-hover w-full transition-colors font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="lg:hidden sticky top-0 left-0 right-0 h-16 bg-secondary/95 backdrop-blur-md border-b border-border flex items-center px-4 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-xl text-muted hover:text-heading hover:bg-card-hover transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="ml-3"><Brand /></div>
        <div className="ml-auto">
          <ThemeToggle className="h-10 w-10" />
        </div>
      </div>

      <main className="lg:ml-64 pt-6 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
