'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface LinkedStudent {
  student_id: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    class: { id: string; name: string } | null;
    school: { id: string; name: string; motto: string | null } | null;
  };
}

interface PortalContextValue {
  linkedStudents: LinkedStudent[];
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  selectedStudent: LinkedStudent | null;
  loading: boolean;
  /**
   * Human-readable error from the most recent load. Distinct from
   * "no children" (which is a valid empty state).
   */
  loadError: string | null;
  /**
   * Cached term id for the currently selected student's school. Hoisted
   * here so per-student pages don't each re-resolve the term.
   * Null while loading or if the student's school row is missing.
   */
  termIdByStudent: Map<string, string | null>;
  refresh: () => Promise<void>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

type ApiResponse =
  | { success: true; data: { students: LinkedStudent[] } }
  | { success: false; error: string }
  | { data?: { students?: LinkedStudent[] }; error?: string };

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [termIdByStudent, setTermIdByStudent] = useState<Map<string, string | null>>(new Map());

  const loadStudents = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/portal/students', { credentials: 'same-origin' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        setLoadError('We could not load your children. Please refresh.');
        setLinkedStudents([]);
        return;
      }
      const json = (await res.json()) as ApiResponse;
      if ('success' in json && json.success === false) {
        setLoadError(json.error || 'We could not load your children. Please refresh.');
        setLinkedStudents([]);
        return;
      }
      const students =
        (json && typeof json === 'object' && 'data' in json && json.data?.students) || [];
      setLinkedStudents(students);
      if (students.length > 0 && !students.some((s) => s.student_id === selectedStudentId)) {
        setSelectedStudentId(students[0].student_id);
      }
    } catch (err) {
      console.error('[PortalContext] /api/portal/students failed', err);
      setLoadError('We could not reach the server. Please check your connection.');
      setLinkedStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * BUG-M3 FIX: termIdByStudent was always empty because the previous
   * implementation either:
   *   (a) queried Supabase directly (bypassing the server cache), or
   *   (b) never ran at all (the Map was never populated).
   *
   * New approach:
   *   1. Deduplicate by school_id so siblings in the same school share
   *      one fetch (not one per child).
   *   2. Fetch via /api/terms?current_only=true which is server-cached,
   *      role-scoped, and follows the standard API contract.
   *   3. Map result back to each student_id.
   *
   * This runs once when linkedStudents changes (on load + refresh).
   * The cancelled flag prevents setState after unmount.
   */
  useEffect(() => {
    if (linkedStudents.length === 0) return;
    let cancelled = false;

    async function resolveTerms() {
      // Group students by school so one fetch serves all siblings.
      const bySchool = new Map<string, LinkedStudent[]>();
      for (const ls of linkedStudents) {
        const schoolId = ls.student.school?.id;
        if (!schoolId) continue;
        if (!bySchool.has(schoolId)) bySchool.set(schoolId, []);
        bySchool.get(schoolId)!.push(ls);
      }

      const updates = new Map<string, string | null>();

      await Promise.all(
        Array.from(bySchool.entries()).map(async ([, students]) => {
          try {
            // Use the server-cached /api/terms route (BUG-C2 fix).
            // This is the same route the dashboard layout uses — result
            // is warm in the server LRU within 60s of the dashboard load.
            const termRes = await fetch('/api/terms?current_only=true', {
              credentials: 'same-origin',
            });
            let currentTermId: string | null = null;
            if (termRes.ok) {
              const termJson = (await termRes.json()) as {
                success: boolean;
                data: Array<{ id: string }>;
              };
              currentTermId = termJson.data?.[0]?.id ?? null;
            }
            for (const ls of students) {
              updates.set(ls.student_id, currentTermId);
            }
          } catch {
            // Non-fatal: portal pages will receive null term_id and
            // should handle it gracefully (show a "no term" empty state).
            for (const ls of students) {
              updates.set(ls.student_id, null);
            }
          }
        })
      );

      if (cancelled) return;
      setTermIdByStudent(updates);
    }

    void resolveTerms();
    return () => {
      cancelled = true;
    };
  }, [linkedStudents]);

  const selectedStudent =
    linkedStudents.find((s) => s.student_id === selectedStudentId) ?? null;

  return (
    <PortalContext.Provider
      value={{
        linkedStudents,
        selectedStudentId,
        setSelectedStudentId,
        selectedStudent,
        loading,
        loadError,
        termIdByStudent,
        refresh: loadStudents,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
