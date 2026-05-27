'use client';

import { useSchoolStore } from '@/store/school';

/**
 * Hook to access the current academic term context.
 * Wraps the term-related state from the school store.
 */
export function useTerm() {
  const term = useSchoolStore((s) => s.currentTerm);
  const academicYear = useSchoolStore((s) => s.currentAcademicYear);
  const isLoading = useSchoolStore((s) => s.isLoading);

  return {
    term,
    academicYear,
    isLoading,
  };
}
