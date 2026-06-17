'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  GraduationCap,
  Wallet,
  BookOpen,
  Users,
  ClipboardCheck,
  MessageSquare,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { createClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';

interface SearchResult {
  id: string;
  type: 'student' | 'class' | 'payment' | 'staff' | 'page';
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
}

const quickPages: SearchResult[] = [
  { id: 'p1', type: 'page', title: 'Dashboard', subtitle: 'Overview', href: '/dashboard', icon: GraduationCap },
  { id: 'p2', type: 'page', title: 'Fee Accounts', subtitle: 'View all fee accounts', href: '/dashboard/fees/accounts', icon: Wallet },
  { id: 'p3', type: 'page', title: 'Record Payment', subtitle: 'Record a new payment', href: '/dashboard/fees/payments/new', icon: Wallet },
  { id: 'p4', type: 'page', title: 'All Students', subtitle: 'Student list', href: '/dashboard/students', icon: GraduationCap },
  { id: 'p5', type: 'page', title: 'Enroll Student', subtitle: 'New enrollment', href: '/dashboard/students/enroll', icon: GraduationCap },
  { id: 'p6', type: 'page', title: 'Marks Entry', subtitle: 'Enter student marks', href: '/dashboard/academics/marks', icon: BookOpen },
  { id: 'p7', type: 'page', title: 'Take Attendance', subtitle: 'Mark attendance', href: '/dashboard/attendance/take', icon: ClipboardCheck },
  { id: 'p8', type: 'page', title: 'Send Message', subtitle: 'SMS / announcement', href: '/dashboard/communication/compose', icon: MessageSquare },
  { id: 'p9', type: 'page', title: 'Staff Directory', subtitle: 'Manage staff', href: '/dashboard/staff', icon: Users },
  { id: 'p10', type: 'page', title: 'Settings', subtitle: 'School settings', href: '/dashboard/settings/school', icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const schoolId = useSchoolStore((s) => s.school?.id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(quickPages);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  // Search
  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults(quickPages);
        return;
      }

      const supabase = createClient();
      const searchResults: SearchResult[] = [...quickPages.filter((p) =>
        p.title.toLowerCase().includes(q.toLowerCase())
      )];

      if (schoolId) {
        // Search students
        const { data: students } = await supabase
          .from('students')
          .select('id, full_name, admission_number, current_class_id')
          .eq('school_id', schoolId)
          .ilike('full_name', `%${q}%`)
          .limit(5);

        if (students) {
          students.forEach((s: { id: string; full_name: string; admission_number: string | null }) =>
            searchResults.push({
              id: s.id,
              type: 'student',
              title: s.full_name,
              subtitle: `Admission: ${s.admission_number}`,
              href: `/dashboard/students/${s.id}`,
              icon: GraduationCap,
            })
          );
        }

        // Search staff
        const { data: staff } = await supabase
          .from('staff')
          .select('id, full_name, role_title')
          .eq('school_id', schoolId)
          .ilike('full_name', `%${q}%`)
          .limit(3);

        if (staff) {
          staff.forEach((s: { id: string; full_name: string; role_title: string | null }) =>
            searchResults.push({
              id: s.id,
              type: 'staff',
              title: s.full_name,
              subtitle: s.role_title ?? '',
              href: `/dashboard/staff`,
              icon: Users,
            })
          );
        }
      }

      setResults(searchResults);
      setSelectedIndex(0);
    },
    [schoolId]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    setCommandPaletteOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  }

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandPaletteOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-bg-tertiary border border-border rounded-xl shadow-2xl overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="w-5 h-5 text-disabled" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search students, classes, payments..."
                  className="flex-1 bg-transparent text-heading placeholder:text-muted outline-none"
                />
                <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary text-[10px] text-muted">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto py-2">
                {results.length === 0 ? (
                  <div className="px-4 py-8 text-center text-muted text-sm">
                    No results found
                  </div>
                ) : (
                  results.map((result, index) => {
                    const Icon = result.icon;
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${ index === selectedIndex ? 'bg-warning-50 text-secondary' : 'text-disabled hover:bg-card-hover' }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {result.title}
                          </p>
                          <p className="text-xs text-muted truncate">
                            {result.subtitle}
                          </p>
                        </div>
                        {index === selectedIndex && (
                          <ArrowRight className="w-4 h-4 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted">
                <span>?+&apos;?+&quot; Navigate</span>
                <span>?+? Select</span>
                <span>ESC Close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
