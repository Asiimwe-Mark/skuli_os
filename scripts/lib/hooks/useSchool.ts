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
    let cancelled = false;

    async function loadSchoolContext() {
      store.setLoading(true);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        store.setLoading(false);
        return;
      }

      // SECURITY (audit 12.x): the previous version used `.single()`
      // on every read. A user whose users row was deleted (or whose
      // RLS visibility was revoked) but who still has a valid session
      // cookie would throw PGRST116 from the .single() and the
      // promise rejection would blank the entire dashboard. Use
      // `.maybeSingle()` so the null-check is the only path to "no
      // row" — never a thrown error. The dashboard layout's own auth
      // flow does the same (see app/dashboard/layout.tsx).
      const { data: profile } = await supabase
        .from('users')
        .select('id, school_id, role, full_name, phone, avatar_url, is_active, email, is_deleted')
        .eq('id', authUser.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile) {
        // SECURITY (pre-launch sweep D5): narrow .select() so the browser
        // never receives sensitive future columns added to the users
        // table. The cast to UserProfile is a partial — fields we don't
        // need (created_at, updated_at) are omitted; downstream code
        // must treat unknown fields as undefined.
        store.setUser(profile as unknown as UserProfile);

        if (profile.school_id) {
          const { data: school } = await supabase
            // SECURITY (pre-launch sweep D4): narrow .select() to drop
            // africas_talking_*_enc, pesapal_*_enc, resend_api_key_enc.
            // The School type has more fields (group_id, cash_on,
            // created_at, updated_at, is_deleted) than we need for the
            // dashboard render — partial is fine.
            .from('schools')
            .select('id, name, logo_url, address, district, phone, email, motto, school_code, school_type, subscription_plan, subscription_status, trial_ends_at, max_students, sms_sender_id')
            .eq('id', profile.school_id)
            .maybeSingle();

          if (cancelled) return;
          if (school) store.setSchool(school as unknown as School);

          const { data: term } = await supabase
            .from('terms')
            .select('id, name, school_id, is_current, start_date, end_date')
            .eq('school_id', profile.school_id)
            .eq('is_current', true)
            .maybeSingle();

          if (cancelled) return;
          if (term) store.setCurrentTerm(term as unknown as Term);

          const { data: year } = await supabase
            .from('academic_years')
            .select('id, name, school_id, is_current, start_date, end_date')
            .eq('school_id', profile.school_id)
            .eq('is_current', true)
            .maybeSingle();

          if (cancelled) return;
          if (year) store.setCurrentAcademicYear(year as unknown as AcademicYear);
        }
      }

      if (!cancelled) {
        store.setLoading(false);
      }
    }

    loadSchoolContext();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    school: store.school,
    term: store.currentTerm,
    academicYear: store.currentAcademicYear,
    userRole: store.userRole,
    isLoading: store.isLoading,
  };
}
