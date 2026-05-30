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
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role, full_name, phone")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "PARENT") {
        router.push("/login");
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
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm text-gray-500">Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* PWA Manifest */}
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#f59e0b" />
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/portal" className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            <span className="text-lg font-bold text-indigo-600">SKULI</span>
          </Link>

          {/* Child Selector */}
          {childrenList.length > 1 && selectedChild && (
            <div className="relative">
              <button
                onClick={() => setShowChildSelector(!showChildSelector)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-100"
              >
                <span>{selectedChild.full_name}</span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>

              <AnimatePresence>
                {showChildSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {childrenList.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => {
                          setSelectedChild(child);
                          setShowChildSelector(false);
                        }}
                        className={cn(
                          "flex w-full flex-col px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50",
                          selectedChild.id === child.id && "bg-indigo-50 text-indigo-700"
                        )}
                      >
                        <span className="font-medium">{child.full_name}</span>
                        <span className="text-xs text-gray-500">
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
            <span className="text-sm font-medium text-gray-700">
              {selectedChild.full_name}
            </span>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 sm:pb-6">
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

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white sm:hidden">
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
                    ? "text-indigo-600"
                    : "text-gray-500 active:text-gray-700"
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
                  ? "text-indigo-600"
                  : "text-gray-500 active:text-gray-700"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
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
                        "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-gray-50",
                        isActive ? "text-indigo-600 bg-indigo-50" : "text-gray-700"
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
