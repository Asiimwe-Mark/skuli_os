'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import type { School, UserProfile, Term, AcademicYear } from '@/types';

/**
 * Hook to load and provide current school, term, and user context.
 * Call this in the dashboard layout to populate the store.
 */
export function useSchool() {
  const store = useSchoolStore();
  const supabase = createClient();

  useEffect(() => {
    async function loadSchoolContext() {
      store.setLoading(true);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        store.setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        store.setUser(profile as UserProfile);

        if (profile.school_id) {
          const { data: school } = await supabase
            .from('schools')
            .select('*')
            .eq('id', profile.school_id)
            .single();

          if (school) store.setSchool(school as School);

          const { data: term } = await supabase
            .from('terms')
            .select('*')
            .eq('school_id', profile.school_id)
            .eq('is_current', true)
            .single();

          if (term) store.setCurrentTerm(term as Term);

          const { data: year } = await supabase
            .from('academic_years')
            .select('*')
            .eq('school_id', profile.school_id)
            .eq('is_current', true)
            .single();

          if (year) store.setCurrentAcademicYear(year as AcademicYear);
        }
      }

      store.setLoading(false);
    }

    loadSchoolContext();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    school: store.school,
    term: store.currentTerm,
    academicYear: store.currentAcademicYear,
    userRole: store.userRole,
    isLoading: store.isLoading,
  };
}
