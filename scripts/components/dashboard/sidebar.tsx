"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { useSchoolStore } from "@/store/school";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Wallet,
  GraduationCap,
  BookOpen,
  MessageSquare,
  CalendarCheck,
  Users,
  Settings,
  LogOut,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CreditCard,
  FileText,
  Receipt,
  AlertTriangle,
  BarChart3,
  UserPlus,
  School,
  ClipboardList,
  Send,
  Inbox,
  FileStack,
  Calculator,
  UserCog,
  UserCheck,
  Key,
  Bell,
  TrendingDown,
  TrendingUp,
  Tag,
  Library,
  Box,
  Upload,
  Shield,
  Calendar,
  Clock,
  X,
  Gift,
  FileBarChart,
  Store,
  type LucideIcon,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  roles?: string[];
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["SCHOOL_ADMIN"],
  },
  {
    label: "Students",
    icon: GraduationCap,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "All Students",        href: "/dashboard/students",                icon: Users },
      { label: "Enroll Student",      href: "/dashboard/students/enroll",         icon: UserPlus },
      { label: "Bulk Import",         href: "/dashboard/students/bulk-import",     icon: Upload },
      { label: "Promote",             href: "/dashboard/students/promote",         icon: GraduationCap },
      { label: "Classes",             href: "/dashboard/students/classes",         icon: School },
      { label: "Alumni",              href: "/dashboard/students/alumni",          icon: GraduationCap },
    ],
  },
  {
    label: "Fees",
    icon: Wallet,
    roles: ["SCHOOL_ADMIN", "BURSAR"],
    children: [
      { label: "Fee Accounts",         href: "/dashboard/fees/accounts",              icon: FileText },
      { label: "Record Payment",       href: "/dashboard/fees/payments",              icon: Receipt },
      { label: "Fee Structure",        href: "/dashboard/fees/structure",             icon: CreditCard },
      { label: "Discounts",            href: "/dashboard/fees/discounts",             icon: CreditCard },
      { label: "Defaulters",           href: "/dashboard/fees/defaulters",            icon: AlertTriangle },
      { label: "Receipts",             href: "/dashboard/fees/receipts",              icon: Receipt },
      { label: "Statements",           href: "/dashboard/fees/statements",            icon: FileText },
      { label: "Expenses",             href: "/dashboard/fees/expenses",              icon: TrendingDown },
      { label: "P&L Report",           href: "/dashboard/fees/expenses/pl-report",    icon: TrendingUp },
      { label: "Expense Categories",   href: "/dashboard/fees/expenses/categories",   icon: Tag },
      { label: "Reports",              href: "/dashboard/fees/reports",               icon: BarChart3 },
    ],
  },
  {
    label: "Academics",
    icon: BookOpen,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Marks Entry",     href: "/dashboard/academics/marks",          icon: ClipboardList },
      { label: "Review Marks",    href: "/dashboard/academics/marks/review",   icon: ClipboardList },
      { label: "Report Cards",    href: "/dashboard/academics/report-cards",   icon: FileText },
      { label: "Subjects",        href: "/dashboard/academics/subjects",       icon: BookOpen },
      { label: "Timetable",       href: "/dashboard/academics/timetable",      icon: Clock },
      { label: "Calendar",        href: "/dashboard/academics/calendar",       icon: Calendar },
    ],
  },
  {
    label: "Attendance",
    icon: CalendarCheck,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Take Attendance", href: "/dashboard/attendance/take", icon: ClipboardList },
      { label: "Overview",        href: "/dashboard/attendance",     icon: CalendarCheck },
    ],
  },
  {
    label: "Communication",
    icon: MessageSquare,
    roles: ["SCHOOL_ADMIN", "BURSAR"],
    children: [
      { label: "Compose",      href: "/dashboard/communication/compose",     icon: Send },
      { label: "Inbox",        href: "/dashboard/communication/inbox",       icon: Inbox },
      { label: "Templates",    href: "/dashboard/communication/templates",   icon: FileStack },
      { label: "Marketplace",  href: "/dashboard/communication/marketplace", icon: Store, roles: ["SCHOOL_ADMIN"] },
      { label: "SMS Logs",     href: "/dashboard/communication/logs",        icon: FileText },
    ],
  },
  {
    label: "Staff & Payroll",
    icon: Users,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Staff Directory", href: "/dashboard/staff",         icon: UserCog },
      { label: "Payroll",         href: "/dashboard/staff/payroll", icon: Calculator },
    ],
  },
  {
    label: "Meetings",
    icon: UserCheck,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Schedule Meetings", href: "/dashboard/meetings", icon: CalendarCheck },
    ],
  },
  {
    label: "Analytics",
    icon: BarChart3,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Overview",        href: "/dashboard/analytics",        icon: BarChart3 },
      { label: "Custom Reports",  href: "/dashboard/analytics/reports",icon: FileText },
      { label: "EMIS Report",     href: "/dashboard/analytics/emis",   icon: FileBarChart, roles: ["SCHOOL_ADMIN"] },
    ],
  },
  {
    label: "Library",
    icon: Library,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Book Catalog",     href: "/dashboard/library",        icon: BookOpen },
      { label: "Issues & Returns", href: "/dashboard/library/issues", icon: ClipboardList },
    ],
  },
  {
    label: "Assets",
    icon: Box,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "Assets & Inventory", href: "/dashboard/assets", icon: Box },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    roles: ["SCHOOL_ADMIN"],
    children: [
      { label: "School Profile",   href: "/dashboard/settings/school",         icon: School },
      { label: "Users & Roles",    href: "/dashboard/settings/users",          icon: Users },
      { label: "Invite User",      href: "/dashboard/settings/users/invite",   icon: UserPlus },
      { label: "API Keys",         href: "/dashboard/settings/api",            icon: Key },
      { label: "Notifications",    href: "/dashboard/settings/notifications",  icon: Bell },
      { label: "Billing",          href: "/dashboard/settings/billing",        icon: CreditCard },
      { label: "Referral Programme", href: "/dashboard/settings/referral",      icon: Gift, roles: ["SCHOOL_ADMIN"] },
      { label: "Audit Log",        href: "/dashboard/settings/audit-log",      icon: Shield },
    ],
  },
];

const GROUP_NAV_ITEMS: NavItem[] = [
  { label: "Overview",  href: "/group",            icon: LayoutDashboard },
  { label: "Schools",   href: "/group/schools",    icon: School },
  { label: "Analytics", href: "/group/analytics",  icon: BarChart3 },
  { label: "Settings",  href: "/group/settings",   icon: Settings },
];

function SidebarItem({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.href && pathname.startsWith(c.href)) ?? false
  );
  const { userRole } = useSchoolStore();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  if (item.roles && userRole && !item.roles.includes(userRole)) {
    return null;
  }

  const visibleChildren = item.children?.filter(
    (c) => !c.roles || (userRole && c.roles.includes(userRole))
  );

  const isActive = item.href ? pathname === item.href : false;
  const hasActiveChild = visibleChildren?.some(
    (c) => c.href && pathname.startsWith(c.href)
  );

  if (item.children && visibleChildren && visibleChildren.length > 0) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            hasActiveChild
              ? "bg-brand-600 text-white shadow-soft dark:bg-brand-500"
              : "text-muted hover:bg-card-hover hover:text-heading",
            collapsed && "justify-center px-2"
          )}
        >
          <item.icon
            className={cn(
              "w-5 h-5 shrink-0 transition-colors",
              hasActiveChild ? "text-white" : "text-muted group-hover:text-heading"
            )}
          />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </>
          )}
        </button>
        <AnimatePresence>
          {expanded && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="ml-3 pl-3 border-l border-border space-y-0.5 mt-1">
                {visibleChildren.map((child) => (
                  <SidebarItem key={child.label} item={child} depth={depth + 1} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-brand-600 text-white shadow-soft dark:bg-brand-500"
          : "text-muted hover:bg-card-hover hover:text-heading",
        collapsed && "justify-center px-2"
      )}
    >
      <item.icon
        className={cn(
          "w-5 h-5 shrink-0",
          isActive ? "text-white" : "text-muted"
        )}
      />
      {!collapsed && <span className="relative">{item.label}</span>}
    </Link>
  );
}

interface SidebarContentProps {
  onClose?: () => void;
  isMobile?: boolean;
}

function SidebarContent({ onClose, isMobile = false }: SidebarContentProps) {
  const { school, user, userRole, reset: resetSchoolStore } = useSchoolStore();
  const { sidebarCollapsed, toggleSidebar, reset: resetUIStore } = useUIStore();
  const supabase = createBrowserClient();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const navItems = userRole === "GROUP_ADMIN" ? GROUP_NAV_ITEMS : NAV_ITEMS;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      resetSchoolStore?.();
      resetUIStore?.();
    } finally {
      window.location.href = "/login";
    }
  };

  const initials =
    user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "SA";

  const roleBadgeColors: Record<string, string> = {
    SUPER_ADMIN:   "bg-bg-tertiary text-muted border border-border",
    SCHOOL_ADMIN:  "bg-bg-tertiary text-heading border border-border",
    BURSAR:        "bg-success-50 text-success-700 border border-success-100 dark:bg-success-900/30 dark:text-success-400 dark:border-success-800",
    TEACHER:       "bg-info-50 text-info-700 border border-info-100 dark:bg-info-900/30 dark:text-info-400 dark:border-info-800",
    PARENT:        "bg-warning-50 text-warning-700 border border-warning-100 dark:bg-warning-900/30 dark:text-warning-400 dark:border-warning-800",
    GROUP_ADMIN:   "bg-warning-50 text-warning-700 border border-warning-100 dark:bg-warning-900/30 dark:text-warning-400 dark:border-warning-800",
  };

  const collapsed = isMobile ? false : sidebarCollapsed;

  return (
    <div className="flex flex-col h-full bg-secondary">
      {/* Brand header */}
      <div className="px-4 py-4 border-b border-border h-16 flex items-center gap-3">
        {school?.logo_url ? (
          <div className="w-9 h-9 rounded-lg ring-2 ring-border shrink-0 relative overflow-hidden">
            <Image
              src={school.logo_url}
              alt={school.name}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0 shadow-soft">
            <span className="text-heading font-display font-bold text-sm">
              {school?.name?.[0] || "S"}
            </span>
          </div>
        )}
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden flex-1 min-w-0"
          >
            <h2 className="font-display font-bold text-sm truncate text-heading">
              {school?.name || "SKULI"}
            </h2>
            <p className="text-[10px] font-medium text-muted truncate">
              {school?.subscription_plan
                ? `${school.subscription_plan.charAt(0).toUpperCase() + school.subscription_plan.slice(1)} Plan`
                : "Free Trial"}
            </p>
          </motion.div>
        )}
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-muted hover:text-heading hover:bg-card-hover transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <SidebarItem key={item.label} item={item} />
          ))}
        </nav>
      </ScrollArea>

      {/* User section */}
      <div className="p-3 border-t border-border bg-bg-tertiary/60">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center"
          )}
        >
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate text-heading">
                {user?.full_name || "Admin"}
              </p>
              <span
                className={cn(
                  "inline-block text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wider mt-0.5",
                  roleBadgeColors[userRole || ""] || "bg-bg-tertiary text-muted"
                )}
              >
                {userRole?.replace("_", " ") || "ADMIN"}
              </span>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Sign out"
              className="shrink-0 h-8 w-8 text-muted hover:text-danger-600 hover:bg-card-hover dark:hover:bg-danger-900/20"
            >
              {loggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {!isMobile && (
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted hover:text-heading hover:border-border transition-colors z-50 shadow-card"
          aria-label="Toggle sidebar"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen } = useUIStore();

  return (
    <>
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 268 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="h-screen bg-secondary border-r border-border flex flex-col fixed left-0 top-0 z-40 hidden lg:flex"
      >
        <SidebarContent />
      </motion.aside>

      <AnimatePresence>
        {sidebarMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed left-0 top-0 h-screen w-[280px] max-w-[85vw] bg-secondary border-r border-border flex flex-col z-40 lg:hidden shadow-pop"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <SidebarContent
                isMobile
                onClose={() => setSidebarMobileOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
