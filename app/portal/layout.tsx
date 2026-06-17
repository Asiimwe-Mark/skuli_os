"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { PortalProvider, usePortal } from "@/app/portal/PortalContext";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorBoundary } from '@/components/error-boundary';
import {
  Home,
  CreditCard,
  FileText,
  MessageSquare,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  Loader2,
  UserCheck,
  CalendarDays,
  CalendarCheck,
  Bell,
  MoreHorizontal,
  Heart,
  GraduationCap,
} from "lucide-react";

const navItems = [
  { href: "/portal",                label: "Home",          icon: Home },
  { href: "/portal/fees",           label: "Fees",          icon: CreditCard },
  { href: "/portal/results",        label: "Results",       icon: FileText },
  { href: "/portal/attendance",     label: "Attendance",    icon: CalendarCheck },
  { href: "/portal/meetings",       label: "Meetings",      icon: UserCheck },
  { href: "/portal/calendar",       label: "Calendar",      icon: CalendarDays },
  { href: "/portal/messages",       label: "Messages",      icon: MessageSquare },
  { href: "/portal/notifications",  label: "Notifications", icon: Bell },
  { href: "/portal/profile",        label: "Profile",       icon: User },
];

const mobileNavPrimary = navItems.slice(0, 4);
const mobileNavMore = navItems.slice(4);

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalProvider>
      <PortalShell>{children}</PortalShell>
    </PortalProvider>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Memoised supabase client. Audit 3.90, 3.91.
  const supabase = useSupabaseBrowser();
  // Selectors instead of `useSchoolStore()` (audit 3.29).
  const setUser = useSchoolStore((s) => s.setUser);
  const reset = useSchoolStore((s) => s.reset);
  const { linkedStudents, selectedStudentId, setSelectedStudentId, selectedStudent } = usePortal();
  const [loading, setLoading] = useState(true);
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [parentName, setParentName] = useState("");

  // Subscribe to cross-tab sign-out / token refresh (audit 2.8, 3.67).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        reset();
        window.location.href = "/login";
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, reset]);

  useEffect(() => {
    let cancelled = false;
    async function loadParentData() {
      const { data: sessionResp } = await supabase.auth.getSession();
      const userId = sessionResp.session?.user?.id;
      if (cancelled) return;
      if (!userId) { router.push("/login"); return; }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, school_id, role, full_name, phone, avatar_url, is_active, email, is_deleted")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (profileError) {
        const isAuthErr = profileError.code === "PGRST301" || /jwt|auth/i.test(profileError.message ?? "");
        if (isAuthErr) { router.push("/login"); return; }
        setLoading(false); return;
      }
      if (!profile) { setLoading(false); router.push("/login"); return; }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        setLoading(false);
        window.location.href = "/login?error=deactivated";
        return;
      }

      if (profile.role !== "PARENT") {
        const roleRedirects: Record<string, string> = {
          SUPER_ADMIN: "/admin", SCHOOL_ADMIN: "/dashboard", BURSAR: "/dashboard/fees",
          TEACHER: "/teacher", GROUP_ADMIN: "/group",
        };
        window.location.href = roleRedirects[profile.role] || "/login";
        return;
      }

      // setUser updates user + userRole atomically in a single set()
      // (audit 6.13). No need for a separate setUserRole call.
      setUser(profile as import("@/types").UserProfile);
      if (profile.full_name) setParentName(profile.full_name);
      if (!cancelled) setLoading(false);
    }
    loadParentData();
    return () => { cancelled = true; };
  }, [supabase, router, setUser]);

  // Service worker is registered globally by components/providers.tsx
  // (audit Bug #6) — do not duplicate the registration here.

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-[3px] border-border border-t-brand-600 animate-spin" />
          <p className="text-sm text-muted font-medium">Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-heading">
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#0A0F1C" />

      {/* Top Bar */}
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-secondary/95 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4 gap-2">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-soft">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-heading">SKULI</span>
          </Link>

          {linkedStudents.length > 1 && selectedStudent && (
            <div className="relative">
              <button
                onClick={() => setShowChildSelector(!showChildSelector)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-bg-tertiary px-3 py-1.5 text-sm font-semibold transition-all hover:border-border text-heading"
              >
                <span className="hidden sm:inline">{selectedStudent.student.full_name}</span>
                <span className="sm:hidden truncate max-w-[100px]">{selectedStudent.student.full_name}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", showChildSelector && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showChildSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card py-1.5 shadow-pop overflow-hidden"
                  >
                    {linkedStudents.map((ls) => (
                      <button
                        key={ls.student_id}
                        onClick={() => {
                          setSelectedStudentId(ls.student_id);
                          setShowChildSelector(false);
                        }}
                        className={cn(
                          "flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors",
                          selectedStudentId === ls.student_id
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                            : "hover:bg-card-hover text-heading"
                        )}
                      >
                        <span className="font-semibold">{ls.student.full_name}</span>
                        <span className="text-xs text-muted">
                          {ls.student.class?.name ?? "N/A"} - {ls.student.admission_number}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {linkedStudents.length === 1 && selectedStudent && (
            <span className="hidden sm:inline text-sm font-semibold text-muted">
              {selectedStudent.student.full_name}
            </span>
          )}

          <div className="flex items-center gap-1">
            <ThemeToggle className="h-10 w-10" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card-hover hover:text-heading"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Side Navigation */}
      <nav className="hidden sm:flex fixed left-0 top-16 bottom-0 w-60 flex-col border-r border-border bg-secondary z-30">
        <div className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-brand-600 text-white shadow-soft dark:bg-brand-500"
                    : "text-muted hover:bg-card-hover hover:text-heading"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-white" : "")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        {parentName && (
          <div className="mt-auto border-t border-border p-3 bg-bg-tertiary/60">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-tertiary text-heading font-bold text-sm shadow-soft">
                {parentName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-heading">{parentName}</p>
                <span className="inline-block text-[9px] font-semibold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800">
                  <Heart className="inline h-2 w-2 mr-0.5" /> Parent
                </span>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="pt-6 pb-24 sm:pb-8 sm:ml-60 px-4 sm:px-6">
        <div className="max-w-[1400px] mx-auto">
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

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-secondary/95 backdrop-blur-md sm:hidden">
        <div className="flex items-center justify-around px-2 py-1.5">
          {mobileNavPrimary.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors min-w-[64px]",
                  isActive ? "text-brand-600" : "text-muted active:text-heading"
                )}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-bg-tertiary" />
                )}
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors min-w-[64px]",
                mobileNavMore.some((i) => i.href === pathname)
                  ? "text-brand-600"
                  : "text-muted active:text-heading"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-border bg-card py-1.5 shadow-pop overflow-hidden"
                >
                  {mobileNavMore.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setShowMoreMenu(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                          isActive
                            ? "text-brand-700 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
                            : "text-heading hover:bg-card-hover"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>
    </div>
  );
}
