"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { Search, Users, GraduationCap, CreditCard, ArrowRight } from "lucide-react";

interface SearchResult {
  type: "student" | "class" | "payment" | "staff" | "page";
  title: string;
  subtitle?: string;
  href: string;
}

const QUICK_PAGES: SearchResult[] = [
  { type: "page", title: "Dashboard", href: "/dashboard" },
  { type: "page", title: "Record Payment", href: "/dashboard/fees/payments/new" },
  { type: "page", title: "Take Attendance", href: "/dashboard/attendance/take" },
  { type: "page", title: "Enter Marks", href: "/dashboard/academics/marks" },
  { type: "page", title: "Enroll Student", href: "/dashboard/students/enroll" },
  { type: "page", title: "Send SMS", href: "/dashboard/communication/compose" },
  { type: "page", title: "Fee Structure", href: "/dashboard/fees/structure" },
  { type: "page", title: "Report Cards", href: "/dashboard/academics/report-cards" },
];

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
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

      // Filter quick pages
      const pageResults = QUICK_PAGES.filter((p) =>
        p.title.toLowerCase().includes(lower)
      );

      // Search students
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, admission_number, current_class_id")
        .ilike("full_name", `%${q}%`)
        .eq("is_deleted", false)
        .limit(5);

      const studentResults: SearchResult[] = (students || []).map((s: any) => ({
        type: "student" as const,
        title: s.full_name,
        subtitle: s.admission_number,
        href: `/dashboard/students/${s.id}`,
      }));

      // Search classes
      const { data: classes } = await supabase
        .from("classes")
        .select("id, name")
        .ilike("name", `%${q}%`)
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
    [supabase]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Keyboard shortcut
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

  const iconMap = {
    student: GraduationCap,
    class: Users,
    payment: CreditCard,
    staff: Users,
    page: ArrowRight,
  };

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-navy/80 backdrop-blur-sm z-50"
            onClick={() => setCommandPaletteOpen(false)}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-navy-100 border border-navy-50/50 rounded-xl shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-navy-50/50">
                <Search className="w-4.5 h-4.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search students, classes, pages..."
                  className="flex-1 h-12 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
                />
                <kbd className="text-[10px] px-1.5 py-0.5 bg-navy-50 rounded text-muted-foreground font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto p-2">
                {results.length === 0 && !loading && query && (
                  <p className="text-center text-muted-foreground text-sm py-8">
                    No results found
                  </p>
                )}
                {results.map((result, i) => {
                  const Icon = iconMap[result.type];
                  return (
                    <button
                      key={`${result.type}-${result.href}-${i}`}
                      onClick={() => navigate(result)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                        i === selectedIndex
                          ? "bg-amber/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-navy-50/50"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium">{result.title}</p>
                        {result.subtitle && (
                          <p className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-muted-foreground/50">
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
