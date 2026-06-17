"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { useSchoolStore } from "@/store/school";
import { useUIStore } from "@/store/ui";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Command,
  Search,
  Bell,
  ChevronRight,
  Calendar,
  Check,
  CheckCheck,
  X,
  Menu,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/dates";
import type { Database } from "@/types/database";

type Term = Database['public']['Tables']['terms']['Row'];
type InAppNotification = Database['public']['Tables']['in_app_notifications']['Row'];

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = segment
      .replace(/-/g, " ")
      .replace(/\[.*?\]/g, "...")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { href, label };
  });

  return (
    <nav className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <div key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted" />}
          {i === crumbs.length - 1 ? (
            <span className="font-semibold text-heading">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted hover:text-heading transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}

function CommandPaletteTrigger() {
  const { toggleCommandPalette } = useUIStore();

  return (
    <button
      onClick={toggleCommandPalette}
      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border hover:border-border text-muted hover:text-heading text-sm transition-colors"
    >
      <Search className="w-3.5 h-3.5 transition-colors group-hover:text-brand-600" />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-card text-[10px] font-mono text-muted border border-border">
        <Command className="w-2.5 h-2.5" />K
      </kbd>
    </button>
  );
}

function TermSwitcher() {
  const { currentTerm, setCurrentTerm, school } = useSchoolStore();
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<Term[]>([]);

  useEffect(() => {
    if (!school) return;
    async function loadTerms() {
      const { data } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date, is_current, school_id")
        .eq("school_id", school!.id)
        .order("start_date", { ascending: false });
      if (data) setTerms(data as unknown as typeof terms);
    }
    loadTerms();
  }, [school, supabase]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border hover:border-border text-sm transition-colors"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-bg-tertiary">
          <Calendar className="w-3 h-3 text-muted" />
        </div>
        <span className="font-semibold text-heading hidden md:inline">
          {currentTerm ? currentTerm.name.replace("Term", "Term ") : "Select Term"}
        </span>
        {currentTerm && (
          <Badge variant="brand" className="hidden lg:inline-flex text-[10px]">
            {formatDate(currentTerm.start_date ?? '')}
          </Badge>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-2rem)] sm:w-80 max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-pop overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border bg-bg-tertiary/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Switch Term
                </p>
              </div>
              <div className="p-1.5 max-h-80 overflow-y-auto">
                {terms.map((term) => (
                  <button
                    key={term.id}
                    onClick={() => {
                      setCurrentTerm(term);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                      currentTerm?.id === term.id
                        ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:ring-brand-800"
                        : "hover:bg-card-hover text-heading"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                        currentTerm?.id === term.id
                          ? "bg-brand-600 text-white"
                          : "bg-bg-tertiary text-muted"
                      )}
                    >
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{term.name.replace("Term", "Term ")}</p>
                      <p className="text-xs text-muted">
                        {formatDate(term.start_date ?? '')} - {formatDate(term.end_date ?? '')}
                      </p>
                    </div>
                    {currentTerm?.id === term.id && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                    {term.is_current && currentTerm?.id !== term.id && (
                      <Badge variant="success" className="text-[10px]">Current</Badge>
                    )}
                  </button>
                ))}
                {terms.length === 0 && (
                  <p className="px-3 py-6 text-sm text-muted text-center">No terms found</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationBell() {
  const { user } = useSchoolStore();
  const supabase = createBrowserClient();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("in_app_notifications")
        .select("id, title, body, type, is_read, is_deleted, created_at, recipient_user_id")
        .eq("recipient_user_id", userId)
        .eq("is_read", false)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled && data) {
        setNotifications(data as unknown as InAppNotification[]);
        setUnreadCount(data.length);
      }
    }
    load();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "in_app_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => { load(); }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  async function markAllRead() {
    if (!user) return;
    await supabase
      .from("in_app_notifications")
      .update({ is_read: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false);
    setNotifications([]);
    setUnreadCount(0);
  }

  async function markOneRead(id: string) {
    await supabase
      .from("in_app_notifications")
      .update({ is_read: true })
      .eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  const typeColors: Record<string, { ring: string; tint: string }> = {
    info:    { ring: "ring-info-100 dark:ring-info-800",     tint: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400" },
    warning: { ring: "ring-warning-100 dark:ring-warning-800", tint: "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400" },
    success: { ring: "ring-success-100 dark:ring-success-800", tint: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" },
    error:   { ring: "ring-danger-100 dark:ring-danger-800",  tint: "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" },
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-lg bg-bg-tertiary border border-border hover:border-border hover:bg-card-hover transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-muted" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-bg-secondary"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-pop overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-bg-tertiary flex items-center justify-center">
                    <Bell className="h-3 w-3 text-muted" />
                  </div>
                  <p className="text-sm font-semibold text-heading">Notifications</p>
                  {unreadCount > 0 && (
                    <Badge variant="brand" className="text-[10px]">
                      {unreadCount} new
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-card-hover dark:hover:bg-brand-900/20"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 hover:bg-card-hover rounded-md text-muted"
                    aria-label="Close notifications"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="h-12 w-12 rounded-xl bg-bg-tertiary mx-auto mb-3 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-muted" />
                    </div>
                    <p className="text-sm font-medium text-heading">You&apos;re all caught up</p>
                    <p className="text-xs text-muted mt-1">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const colors = typeColors[n.type] || typeColors.info;
                    return (
                      <div
                        key={n.id}
                        className="flex gap-3 px-4 py-3 border-b border-border hover:bg-card-hover transition-colors group"
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1",
                            colors.tint,
                            colors.ring
                          )}
                        >
                          <Bell className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-heading">{n.title}</p>
                          {n.body && (
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="text-[10px] text-muted mt-1">
                            {formatDate(n.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => markOneRead(n.id)}
                          className="p-1.5 hover:bg-card-hover rounded-md self-start opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Mark as read"
                          aria-label="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5 text-muted" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="lg:hidden flex items-center gap-1.5">
      <div className="w-7 h-7 rounded-md bg-bg-tertiary flex items-center justify-center">
        <span className="text-heading font-display font-bold text-xs">S</span>
      </div>
      <span className="font-display font-bold text-base tracking-tight text-heading">
        SKULI
      </span>
    </div>
  );
}

export function Topbar() {
  const { sidebarCollapsed, toggleMobileSidebar, toggleCommandPalette } = useUIStore();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-secondary/95 backdrop-blur-md border-b border-border transition-all duration-300",
        sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[268px]"
      )}
    >
      <div className="flex items-center justify-between h-16 px-4 lg:px-6 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="lg:hidden p-2 rounded-md text-muted hover:text-heading hover:bg-card-hover transition-colors"
            onClick={toggleMobileSidebar}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandMark />
          <div className="hidden lg:block min-w-0">
            <Breadcrumbs />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="lg:hidden p-2.5 rounded-lg bg-bg-tertiary border border-border text-muted hover:text-heading hover:border-border transition-colors"
            onClick={toggleCommandPalette}
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <div className="hidden lg:block">
            <CommandPaletteTrigger />
          </div>
          <TermSwitcher />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
