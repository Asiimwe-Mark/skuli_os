import { create } from 'zustand';
import type { School, Term, AcademicYear, UserProfile, UserRole } from '@/types';

interface SchoolStore {
  school: School | null;
  currentTerm: Term | null;
  currentAcademicYear: AcademicYear | null;
  user: UserProfile | null;
  userRole: UserRole | null;
  group: { id: string; name: string; code: string } | null;
  /** True until the first loadContext() cycle completes (or fails). */
  isLoading: boolean;
  /** True once the first loadContext() cycle has resolved (success OR fail). Pages can render. */
  hasLoaded: boolean;
  /** Optional human-readable error from the most recent loadContext() cycle. */
  loadError: string | null;

  // Aliases for convenience (agents used different names)
  term: Term | null;
  academicYear: AcademicYear | null;

  setSchool: (school: School | null) => void;
  setCurrentTerm: (term: Term | null) => void;
  setCurrentAcademicYear: (year: AcademicYear | null) => void;
  /**
   * Sets user and userRole in a single Zustand update so a selector that
   * reads both never sees a torn state. (Audit finding 6.13.)
   */
  setUser: (user: UserProfile | null) => void;
  setUserRole: (role: UserRole | null) => void;
  setGroup: (group: SchoolStore['group']) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (msg: string | null) => void;
  /**
   * Marks the loadContext() cycle as finished. Pass the optional error
   * message to surface it in the UI without throwing.
   */
  finishLoading: (error?: string | null) => void;
  reset: () => void;
}

export const useSchoolStore = create<SchoolStore>((set) => ({
  school: null,
  currentTerm: null,
  currentAcademicYear: null,
  user: null,
  userRole: null,
  group: null,
  isLoading: true,
  hasLoaded: false,
  loadError: null,
  term: null,
  academicYear: null,

  setSchool: (school) => set({ school }),
  setCurrentTerm: (currentTerm) => set({ currentTerm, term: currentTerm }),
  setCurrentAcademicYear: (currentAcademicYear) => set({ currentAcademicYear, academicYear: currentAcademicYear }),
  setUser: (user) => set({ user, userRole: user?.role ?? null }),
  setUserRole: (userRole) => set({ userRole }),
  setGroup: (group) => set({ group }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),
  finishLoading: (error) => set({ isLoading: false, hasLoaded: true, loadError: error ?? null }),
  reset: () =>
    set({
      school: null,
      currentTerm: null,
      currentAcademicYear: null,
      user: null,
      userRole: null,
      group: null,
      isLoading: true,
      hasLoaded: false,
      loadError: null,
      term: null,
      academicYear: null,
    }),
}));
