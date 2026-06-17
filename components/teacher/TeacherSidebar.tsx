"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Megaphone,
  User,
  LogOut,
  Clock,
  ClipboardList,
  UserCheck,
  X,
  Sparkles,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import type { TeacherAssignment } from "@/types";

interface TeacherSidebarProps {
  teacher: {
    full_name: string;
    avatar_url: string | null;
    school_id: string | null;
  };
  assignments: TeacherAssignment[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function TeacherSidebar({ teacher, assignments, mobileOpen = false, onMobileClose }: TeacherSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const pending = JSON.parse(localStorage.getItem("skuli-pending-attendance") || "[]");
        setPendingSyncCount(pending.length);
      } catch {
        setPendingSyncCount(0);
      }
    };
    updateCount();
    window.addEventListener("pending-attendance-changed", updateCount);
    window.addEventListener("storage", updateCount);
    return () => {
      window.removeEventListener("pending-attendance-changed", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  const navItems = [
    { href: "/teacher",              label: "Dashboard",         icon: LayoutDashboard },
    { href: "/teacher/marks",        label: "Marks Entry",       icon: BookOpen },
    { href: "/teacher/attendance",   label: "Take Attendance",   icon: CheckSquare, badge: pendingSyncCount },
    { href: "/teacher/timetable",    label: "My Timetable",      icon: Clock },
    { href: "/teacher/assignments",  label: "My Assignments",    icon: ClipboardList },
    { href: "/teacher/meetings",     label: "Meetings",          icon: UserCheck },
    { href: "/teacher/notices",      label: "Notices",           icon: Megaphone },
    { href: "/teacher/profile",      label: "Profile",           icon: User },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const homeroomClasses = assignments.filter((a) => a.is_class_teacher);
  const subjectClasses = assignments.filter((a) => !a.is_class_teacher && a.subject);

  const SidebarInner = ({ showClose = false }: { showClose?: boolean }) => (
    <div className="fixed left-0 top-0 h-full w-64 bg-bg border-r border-border flex flex-col z-40">
      {/* Brand */}
      <div className="relative h-16 flex items-center px-5 border-b border-border overflow-hidden">
        <div className="pointer-events-none absolute inset-0" />
        <Link href="/teacher" className="flex items-center gap-2 flex-1 relative">
          <div className="relative w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-card">
            <span className="text-white font-display font-bold text-base">S</span>
            <div className="absolute -inset-1 rounded-xl opacity-30 blur-md -z-10 bg-brand-600" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-heading">SKULI</span>
        </Link>
        {showClose && onMobileClose && (
          <button
            onClick={onMobileClose}
            className="ml-auto p-1.5 rounded-lg text-muted hover:text-heading hover:bg-card-hover transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/teacher" && pathname.startsWith(`${item.href}/`));
            const badge = "badge" in item && typeof item.badge === "number" ? item.badge : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-brand-600 text-white shadow-card dark:bg-brand-500"
                      : "text-muted hover:bg-card-hover hover:text-heading"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-white" : "")} />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-bg-tertiary text-heading rounded-full px-1.5 py-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {assignments.length > 0 && (
          <div className="mt-6 px-3">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2.5 px-2 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              My Classes
            </h3>
            <div className="space-y-2">
              {homeroomClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2 flex items-center gap-1">
                    <Home className="h-2.5 w-2.5" />
                    Homeroom
                  </span>
                  {homeroomClasses.map((a) => (
                    <div
                      key={a.class_id}
                      className="text-sm text-heading px-2 py-1.5 rounded-lg hover:bg-card-hover transition-colors"
                    >
                      {a.class?.name}
                      {a.class?.stream ? ` - ${a.class.stream}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {subjectClasses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2">
                    Subjects
                  </span>
                  {subjectClasses.map((a) => (
                    <div
                      key={`${a.class_id}-${a.subject_id}`}
                      className="text-sm text-heading px-2 py-1.5 rounded-lg hover:bg-card-hover transition-colors"
                    >
                      {a.subject?.name} - {a.class?.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Profile footer */}
      <div className="p-3 border-t border-border bg-bg-tertiary">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-2 px-2 hover:bg-card-hover"
            >
              <Avatar className="w-9 h-9">
                <AvatarImage src={teacher.avatar_url || undefined} />
                <AvatarFallback>
                  {teacher.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-semibold truncate text-heading">{teacher.full_name}</p>
                <span className="inline-block text-[9px] font-semibold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-md bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400 border border-info-100">
                  Teacher
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/teacher/profile")}>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">
        <SidebarInner />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-md lg:hidden"
              onClick={onMobileClose}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="lg:hidden"
            >
              <SidebarInner showClose />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
