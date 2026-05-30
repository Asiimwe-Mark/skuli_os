"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { PortalProvider } from "@/app/portal/PortalContext";
import {
  Home,
  CreditCard,
  FileText,
  MessageSquare,
  User,
  LogOut,
  ChevronDown,
  GraduationCap,
  Loader2,
  UserCheck,
  CalendarDays,
  CalendarCheck,
  Bell,
  MoreHorizontal,
} from "lucide-react";

interface Child {
  id: string;
  full_name: string;
  class_name: string;
  admission_number: string;
}

const navItems = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/fees", label: "Fees", icon: CreditCard },
  { href: "/portal/results", label: "Results", icon: FileText },
  { href: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/portal/meetings", label: "Meetings", icon: UserCheck },
  { href: "/portal/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/portal/messages", label: "Messages", icon: MessageSquare },
  { href: "/portal/notifications", label: "Notifications", icon: Bell },
  { href: "/portal/profile", label: "Profile", icon: User },
];

// Mobile bottom bar: first 4 + More menu
const mobileNavPrimary = navItems.slice(0, 4);
const mobileNavMore = navItems.slice(4);

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();

  const [loading, setLoading] = useState(true);
  const [childrenList, setChildrenList] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [parentName, setParentName] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Middleware handles auth — don't redirect from client to avoid race
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role, full_name, phone")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "PARENT") {
        // Not a parent — send to their correct section, not login
        const roleRedirects: Record<string, string> = {
          SUPER_ADMIN: "/admin",
          SCHOOL_ADMIN: "/dashboard",
          BURSAR: "/dashboard",
          TEACHER: "/teacher",
          GROUP_ADMIN: "/group",
        };
        router.push(roleRedirects[profile?.role || ""] || "/dashboard");
        return;
      }

      setParentName(profile.full_name);

      // Find students linked to this parent by phone OR email
      const phoneQuery = profile.phone
        ? supabase
            .from("students")
            .select("id, full_name, admission_number, current_class_id, classes:current_class_id(name)")
            .eq("parent_phone", profile.phone)
            .eq("is_deleted", false)
        : null;

      const emailQuery = user.email
        ? supabase
            .from("students")
            .select("id, full_name, admission_number, current_class_id, classes:current_class_id(name)")
            .eq("parent_email", user.email)
            .eq("is_deleted", false)
        : null;

      const results = await Promise.all([
        phoneQuery || Promise.resolve({ data: [] }),
        emailQuery || Promise.resolve({ data: [] }),
      ]);

      // Merge and deduplicate
      const allStudents = [
        ...(results[0].data || []),
        ...(results[1].data || []),
      ];
      const uniqueStudents = Array.from(
        new Map(allStudents.map((s) => [s.id, s])).values()
      );

      if (uniqueStudents.length > 0) {
        const formatted: Child[] = uniqueStudents.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          class_name: (s.classes as unknown as { name?: string })?.name || "N/A",
          admission_number: s.admission_number,
        }));
        setChildrenList(formatted);
        setSelectedChild(formatted[0]);
      }

      setLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("SW registration failed:", err);
      });
    }
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber" />
          <p className="text-sm text-white/60">Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* PWA Manifest */}
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#0a1628" />
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy shadow-sm">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/portal" className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-amber" />
            <span className="text-lg font-bold text-white">SKULI</span>
          </Link>

          {/* Child Selector */}
          {childrenList.length > 1 && selectedChild && (
            <div className="relative">
              <button
                onClick={() => setShowChildSelector(!showChildSelector)}
                className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <span>{selectedChild.full_name}</span>
                <ChevronDown className="h-4 w-4 text-white/60" />
              </button>

              <AnimatePresence>
                {showChildSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/10 bg-navy py-1 shadow-lg"
                  >
                    {childrenList.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => {
                          setSelectedChild(child);
                          setShowChildSelector(false);
                        }}
                        className={cn(
                          "flex w-full flex-col px-4 py-2 text-left text-sm transition-colors hover:bg-white/10",
                          selectedChild.id === child.id
                            ? "bg-amber/10 text-amber"
                            : "text-white"
                        )}
                      >
                        <span className="font-medium">{child.full_name}</span>
                        <span className="text-xs text-white/50">
                          {child.class_name} &middot; {child.admission_number}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {childrenList.length === 1 && selectedChild && (
            <span className="text-sm font-medium text-white/80">
              {selectedChild.full_name}
            </span>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Desktop Side Navigation */}
      <div className="flex">
        <nav className="hidden sm:flex w-56 shrink-0 flex-col border-r border-white/10 bg-navy min-h-[calc(100vh-3.5rem)]">
          <div className="flex flex-col gap-0.5 p-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-amber/15 text-amber"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          {parentName && (
            <div className="mt-auto border-t border-white/10 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/20 text-xs font-bold text-amber">
                  {parentName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {parentName}
                  </p>
                  <p className="text-xs text-white/50">Parent</p>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Main Content */}
        <main className="flex-1 pb-20 sm:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <PortalProvider>{children}</PortalProvider>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-navy sm:hidden">
        <div className="flex items-center justify-around px-2 py-1">
          {mobileNavPrimary.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "text-amber"
                    : "text-white/50 active:text-white/70"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                mobileNavMore.some((i) => i.href === pathname)
                  ? "text-amber"
                  : "text-white/50 active:text-white/70"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-white/10 bg-navy py-1 shadow-lg"
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
                        "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/10",
                        isActive
                          ? "text-amber bg-amber/10"
                          : "text-white/70"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
