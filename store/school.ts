import { create } from 'zustand';
import type { School, Term, AcademicYear, UserProfile, UserRole } from '@/types';

interface SchoolStore {
  school: School | null;
  currentTerm: Term | null;
  currentAcademicYear: AcademicYear | null;
  user: UserProfile | null;
  userRole: UserRole | null;
  group: { id: string; name: string; code: string } | null;
  isLoading: boolean;

  // Aliases for convenience (agents used different names)
  term: Term | null;
  academicYear: AcademicYear | null;

  setSchool: (school: School | null) => void;
  setCurrentTerm: (term: Term | null) => void;
  setCurrentAcademicYear: (year: AcademicYear | null) => void;
  setUser: (user: UserProfile | null) => void;
  setUserRole: (role: UserRole | null) => void;
  setGroup: (group: SchoolStore['group']) => void;
  setLoading: (loading: boolean) => void;
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
  term: null,
  academicYear: null,

  setSchool: (school) => set({ school }),
  setCurrentTerm: (currentTerm) => set({ currentTerm, term: currentTerm }),
  setCurrentAcademicYear: (currentAcademicYear) => set({ currentAcademicYear, academicYear: currentAcademicYear }),
  setUser: (user) => set({ user, userRole: user?.role ?? null }),
  setUserRole: (userRole) => set({ userRole }),
  setGroup: (group) => set({ group }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () =>
    set({
      school: null,
      currentTerm: null,
      currentAcademicYear: null,
      user: null,
      userRole: null,
      group: null,
      isLoading: true,
      term: null,
      academicYear: null,
    }),
}));
