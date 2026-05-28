"use client";

import { useState } from "react";
import Link from "next/link";
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
  Key,
  Bell,
  TrendingDown,
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
  },
  {
    label: "Fees",
    icon: Wallet,
    roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
    children: [
      { label: "Fee Structure", href: "/dashboard/fees/structure", icon: CreditCard },
      { label: "Discounts", href: "/dashboard/fees/discounts", icon: CreditCard },
      { label: "Expenses", href: "/dashboard/fees/expenses", icon: TrendingDown },
      { label: "Categories", href: "/dashboard/fees/expenses/categories", icon: CreditCard },
      { label: "Fee Accounts", href: "/dashboard/fees/accounts", icon: FileText },
      { label: "Payments", href: "/dashboard/fees/payments", icon: Receipt },
      { label: "Defaulters", href: "/dashboard/fees/defaulters", icon: AlertTriangle },
      { label: "Reports", href: "/dashboard/fees/reports", icon: BarChart3 },
      { label: "Statements", href: "/dashboard/fees/statements", icon: FileText },
      { label: "Receipts", href: "/dashboard/fees/receipts", icon: Receipt },
    ],
  },
  {
    label: "Students",
    icon: GraduationCap,
    roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
    children: [
      { label: "All Students", href: "/dashboard/students", icon: Users },
      { label: "Enroll Student", href: "/dashboard/students/enroll", icon: UserPlus },
      { label: "Classes", href: "/dashboard/students/classes", icon: School },
      { label: "Promote", href: "/dashboard/students/promote", icon: GraduationCap },
    ],
  },
  {
    label: "Academics",
    icon: BookOpen,
    children: [
      { label: "Subjects", href: "/dashboard/academics/subjects", icon: BookOpen, roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
      { label: "Marks Entry", href: "/dashboard/academics/marks", icon: ClipboardList, roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"] },
      { label: "Review Marks", href: "/dashboard/academics/marks/review", icon: ClipboardList, roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
      { label: "Report Cards", href: "/dashboard/academics/report-cards", icon: FileText, roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
      { label: "Timetable", href: "/dashboard/academics/timetable", icon: CalendarCheck, roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"] },
      { label: "Calendar", href: "/dashboard/academics/calendar", icon: CalendarCheck, roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
    ],
  },
  {
    label: "Communication",
    icon: MessageSquare,
    roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
    children: [
      { label: "Send Message", href: "/dashboard/communication/compose", icon: Send },
      { label: "SMS Logs", href: "/dashboard/communication/logs", icon: Inbox },
      { label: "Templates", href: "/dashboard/communication/templates", icon: FileStack },
    ],
  },
  {
    label: "Attendance",
    href: "/dashboard/attendance",
    icon: CalendarCheck,
  },
  {
    label: "Staff & Payroll",
    icon: Users,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    children: [
      { label: "Staff Directory", href: "/dashboard/staff", icon: UserCog },
      { label: "Payroll", href: "/dashboard/staff/payroll", icon: Calculator },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
    children: [
      { label: "School Profile", href: "/dashboard/settings/school", icon: School },
      { label: "Users & Roles", href: "/dashboard/settings/users", icon: Users },
      { label: "API Keys", href: "/dashboard/settings/api", icon: Key },
      { label: "Billing", href: "/dashboard/settings/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
    ],
  },
];

function SidebarItem({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.href && pathname.startsWith(c.href)) ?? false
  );
  const { userRole } = useSchoolStore();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  // Role filtering
  if (item.roles && userRole && !item.roles.includes(userRole)) {
    return null;
  }

  // Filter children by role
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
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            "hover:bg-navy-50/80 hover:text-foreground",
            hasActiveChild ? "text-foreground" : "text-muted-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <item.icon className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
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
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="ml-4 pl-3 border-l border-navy-50 space-y-0.5 mt-1">
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
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative",
        "hover:bg-navy-50/80 hover:text-foreground",
        isActive
          ? "bg-amber/10 text-amber"
          : "text-muted-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-amber rounded-r-full"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <item.icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const { school, user, userRole } = useSchoolStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const supabase = createBrowserClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "SA";

  const roleBadgeColors: Record<string, string> = {
    SUPER_ADMIN: "bg-purple-500/10 text-purple-400",
    SCHOOL_ADMIN: "bg-amber/10 text-amber",
    BURSAR: "bg-emerald/10 text-emerald",
    TEACHER: "bg-blue-400/10 text-blue-400",
    PARENT: "bg-pink-400/10 text-pink-400",
  };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-screen bg-navy-100 border-r border-navy-50/50 flex flex-col fixed left-0 top-0 z-40"
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-navy-50/50 h-16">
        {school?.logo_url ? (
          <img
            src={school.logo_url}
            alt={school.name}
            className="w-8 h-8 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center shrink-0">
            <span className="text-amber font-bold text-sm">
              {school?.name?.[0] || "S"}
            </span>
          </div>
        )}
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-hidden"
          >
            <h2 className="font-semibold text-sm truncate">
              {school?.name || "SKULI"}
            </h2>
            <p className="text-[10px] text-muted-foreground truncate">
              {school?.subscription_plan
                ? `${school.subscription_plan.charAt(0).toUpperCase() + school.subscription_plan.slice(1)} Plan`
                : "Free Trial"}
            </p>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarItem key={item.label} item={item} />
          ))}
        </nav>
      </ScrollArea>

      {/* User section */}
      <div className="p-3 border-t border-navy-50/50">
        <div
          className={cn(
            "flex items-center gap-3",
            sidebarCollapsed && "justify-center"
          )}
        >
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-amber/20 text-amber text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!sidebarCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">
                {user?.full_name || "Admin"}
              </p>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  roleBadgeColors[userRole || ""] || "bg-muted text-muted-foreground"
                )}
              >
                {userRole?.replace("_", " ") || "ADMIN"}
              </span>
            </div>
          )}
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="shrink-0 text-muted-foreground hover:text-rose"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 bg-navy-100 border border-navy-50/50 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-amber transition-colors z-50"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </motion.aside>
  );
}
