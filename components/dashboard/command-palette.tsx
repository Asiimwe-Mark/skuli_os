"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import {
  Search,
  Users,
  GraduationCap,
  CreditCard,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface SearchResult {
  type: "student" | "class" | "payment" | "staff" | "page";
  title: string;
  subtitle?: string;
  href: string;
}

const QUICK_PAGES: SearchResult[] = [
  { type: "page", title: "Dashboard",        href: "/dashboard" },
  { type: "page", title: "Record Payment",   href: "/dashboard/fees/payments/new" },
  { type: "page", title: "Take Attendance",  href: "/dashboard/attendance/take" },
  { type: "page", title: "Enter Marks",      href: "/dashboard/academics/marks" },
  { type: "page", title: "Enroll Student",   href: "/dashboard/students/enroll" },
  { type: "page", title: "Send SMS",         href: "/dashboard/communication/compose" },
  { type: "page", title: "Fee Structure",    href: "/dashboard/fees/structure" },
  { type: "page", title: "Report Cards",     href: "/dashboard/academics/report-cards" },
];

const TYPE_STYLES: Record<SearchResult["type"], { ring: string; tint: string; chip: string }> = {
  student: {
    ring: "ring-border",
    tint: "bg-bg-tertiary text-heading",
    chip: "text-muted",
  },
  class: {
    ring: "ring-info-100 dark:ring-info-800",
    tint: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400",
    chip: "text-info-700 dark:text-info-400",
  },
  payment: {
    ring: "ring-success-100 dark:ring-success-800",
    tint: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400",
    chip: "text-success-700 dark:text-success-400",
  },
  staff: {
    ring: "ring-warning-100 dark:ring-warning-800",
    tint: "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400",
    chip: "text-warning-700 dark:text-warning-400",
  },
  page: {
    ring: "ring-brand-100 dark:ring-brand-800",
    tint: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
    chip: "text-brand-700 dark:text-brand-400",
  },
};

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const school = useSchoolStore((s) => s.school);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient();

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults(QUICK_PAGES);
        return;
      }

      setLoading(true);
      const lower = q.toLowerCase();
      const schoolId = school?.id;

      const pageResults = QUICK_PAGES.filter((p) =>
        p.title.toLowerCase().includes(lower)
      );

      if (!schoolId) {
        setResults(pageResults);
        setSelectedIndex(0);
        setLoading(false);
        return;
      }

      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, admission_number, current_class_id")
        .ilike("full_name", `%${q}%`)
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .limit(5);

      const studentResults: SearchResult[] = (students || []).map((s: any) => ({
        type: "student" as const,
        title: s.full_name,
        subtitle: s.admission_number,
        href: `/dashboard/students/${s.id}`,
      }));

      const { data: classes } = await supabase
        .from("classes")
        .select("id, name")
        .ilike("name", `%${q}%`)
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .limit(3);

      const classResults: SearchResult[] = (classes || []).map((c: any) => ({
        type: "class" as const,
        title: c.name,
        href: `/dashboard/students/classes`,
      }));

      setResults([...pageResults, ...studentResults, ...classResults]);
      setSelectedIndex(0);
      setLoading(false);
    },
    [supabase, school]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex]);
    }
  };

  const navigate = (result: SearchResult) => {
    router.push(result.href);
    setCommandPaletteOpen(false);
    setQuery("");
  };

  const ICON_MAP: Record<SearchResult["type"], React.ElementType> = {
    student: GraduationCap,
    class:   Users,
    payment: CreditCard,
    staff:   Users,
    page:    ArrowRight,
  };

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setCommandPaletteOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[10%] sm:top-[18%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4"
          >
            <div className="bg-card border border-border rounded-xl shadow-pop overflow-hidden">
              <div className="flex items-center gap-3 px-5 border-b border-border">
                {loading ? (
                  <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-muted" />
                )}
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search students, classes, pages..."
                  className="flex-1 h-14 bg-transparent text-heading placeholder:text-muted outline-none text-sm"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-muted font-mono">
                  ESC
                </kbd>
              </div>

              <div className="max-h-96 overflow-y-auto p-2">
                {!query && (
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted">
                    Quick links
                  </div>
                )}
                {results.length === 0 && !loading && query && (
                  <div className="text-center text-muted text-sm py-10">
                    <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    No results found
                  </div>
                )}
                {results.map((result, i) => {
                  const Icon = ICON_MAP[result.type];
                  const style = TYPE_STYLES[result.type];
                  return (
                    <button
                      key={`${result.type}-${result.href}-${i}`}
                      onClick={() => navigate(result)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                        i === selectedIndex
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:ring-brand-800"
                          : "hover:bg-card-hover"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1",
                          style.tint,
                          style.ring
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-semibold text-heading">
                          {result.title}
                        </p>
                        {result.subtitle && (
                          <p className="truncate text-xs text-muted">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider",
                          style.chip
                        )}
                      >
                        {result.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
