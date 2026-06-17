"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, Building2, DollarSign, Settings, LogOut,
  GraduationCap, Menu, X, Gift, Store, HeadphonesIcon, Sparkles, ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { label: "Overview",         href: "/admin",               icon: LayoutDashboard },
  { label: "Schools",          href: "/admin/schools",        icon: Building2 },
  { label: "Revenue",          href: "/admin/revenue",        icon: DollarSign },
  { label: "Referrals",        href: "/admin/referrals",      icon: Gift },
  { label: "Concierge Leads",  href: "/admin/concierge",      icon: HeadphonesIcon },
  { label: "Marketplace",      href: "/admin/marketplace",    icon: Store },
  { label: "Settings",         href: "/admin/settings",       icon: Settings },
];

function AdminSidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const { user } = useSchoolStore();

  return (
    <div className="flex flex-col h-full bg-secondary">
      <div className="relative px-5 h-16 flex items-center gap-2.5 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-soft shrink-0">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 relative min-w-0">
          <span className="font-display text-lg font-bold tracking-tight block leading-tight text-heading">SKULI</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" /> Admin
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-muted hover:text-heading hover:bg-card-hover transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
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

      <div className="p-3 border-t border-border bg-bg-tertiary/60">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-tertiary text-heading text-xs font-bold shadow-soft">
            {user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "SA"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate text-heading">{user?.full_name || "Admin"}</p>
            <span className="inline-block text-[9px] font-semibold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800">
              Super Admin
            </span>
          </div>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted hover:text-heading hover:bg-card-hover w-full transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabaseBrowser();
  const store = useSchoolStore();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data: sessionResp } = await supabase.auth.getSession();
      const userId = sessionResp.session?.user?.id;
      if (!userId) { window.location.href = "/login"; return; }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, school_id, role, full_name, is_active, phone, email, avatar_url, created_at, updated_at, is_deleted")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        const isAuthErr =
          profileError.code === "PGRST301" ||
          /jwt|auth/i.test(profileError.message ?? "");
        if (isAuthErr) { window.location.href = "/login"; return; }
        if (!cancelled) store.setLoading(false);
        return;
      }
      if (!profile) { window.location.href = "/login"; return; }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        window.location.href = "/login?error=deactivated";
        return;
      }
      if (profile.role !== "SUPER_ADMIN") {
        const roleRedirects: Record<string, string> = {
          SCHOOL_ADMIN: "/dashboard", BURSAR: "/dashboard/fees",
          TEACHER: "/teacher", PARENT: "/portal", GROUP_ADMIN: "/group",
        };
        window.location.href = roleRedirects[profile.role] || "/login";
        return;
      }
      if (!cancelled) {
        store.setUser(profile as unknown as import("@/types").UserProfile);
        store.setUserRole(profile.role);
        store.setLoading(false);
        setReady(true);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [supabase, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-[3px] border-border border-t-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-secondary border-r border-border flex-col z-40 hidden lg:flex">
        <AdminSidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed left-0 top-0 bottom-0 w-64 max-w-[85vw] bg-card border-r border-border flex flex-col z-40 lg:hidden shadow-pop"
            >
              <AdminSidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <header className="lg:hidden sticky top-0 z-30 h-16 bg-secondary/95 backdrop-blur-md border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-muted hover:text-heading hover:bg-card-hover transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shadow-soft">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display text-base font-bold text-heading">SKULI</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Admin</span>
        </div>
        <div className="ml-auto">
          <ThemeToggle className="h-10 w-10" />
        </div>
      </header>

      <main className="lg:ml-64 pt-6 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1600px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
