"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { useSchoolStore } from "@/store/school";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  Search,
  Bell,
  ChevronRight,
  Calendar,
  Check,
  CheckCheck,
  X,
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
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
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
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-50/50 border border-navy-50 hover:border-navy-50/80 text-muted-foreground hover:text-foreground text-sm transition-colors"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-navy-50 text-[10px] font-mono text-muted-foreground/60">
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
        .select("*")
        .eq("school_id", school!.id)
        .order("start_date", { ascending: false });
      if (data) setTerms(data);
    }
    loadTerms();
  }, [school, supabase]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-50/50 border border-navy-50 hover:border-navy-50/80 text-sm transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-foreground font-medium">
          {currentTerm ? `${currentTerm.name.replace("Term", "Term ")}` : "Select Term"}
        </span>
        {currentTerm && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {formatDate(currentTerm.start_date)}
          </Badge>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-2 z-50 w-64 bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
            >
              <div className="p-2">
                <p className="px-3 py-1.5 text-xs text-muted-foreground font-medium">Switch Term</p>
                {terms.map((term) => (
                  <button
                    key={term.id}
                    onClick={() => {
                      setCurrentTerm(term);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors",
                      currentTerm?.id === term.id
                        ? "bg-amber/10 text-amber"
                        : "hover:bg-navy-50 text-foreground"
                    )}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{term.name.replace("Term", "Term ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(term.start_date)} — {formatDate(term.end_date)}
                      </p>
                    </div>
                    {currentTerm?.id === term.id && <Check className="w-4 h-4 text-amber" />}
                    {term.is_current && currentTerm?.id !== term.id && (
                      <Badge variant="secondary" className="text-[10px]">Current</Badge>
                    )}
                  </button>
                ))}
                {terms.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No terms found</p>
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

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("in_app_notifications")
      .select("*")
      .eq("recipient_user_id", user.id)
      .eq("is_read", false)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      setNotifications(data);
      setUnreadCount(data.length);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchNotifications();

    // Realtime subscription
    if (!user) return;
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "in_app_notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchNotifications]);

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

  const typeColors: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-400",
    warning: "bg-amber/10 text-amber",
    success: "bg-emerald/10 text-emerald",
    error: "bg-rose/10 text-rose",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-navy-50 transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-2 z-50 w-80 bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Notifications</p>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-amber hover:text-amber-300 transition-colors flex items-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 hover:bg-navy-50 rounded">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex gap-3 px-4 py-3 border-b border-border/50 hover:bg-navy-50/50 transition-colors"
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", typeColors[n.type] || typeColors.info)}>
                        <Bell className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDate(n.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => markOneRead(n.id)}
                        className="p-1 hover:bg-navy-50 rounded self-start"
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar() {
  const { school } = useSchoolStore();

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Breadcrumbs />
        </div>

        <div className="flex items-center gap-2">
          <CommandPaletteTrigger />
          <TermSwitcher />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
