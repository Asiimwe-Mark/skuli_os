"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { useSchoolStore } from "@/store/school";
import { useUIStore } from "@/store/ui";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { ErrorBoundary } from '@/components/error-boundary';
import { motion, AnimatePresence } from "framer-motion";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const overrideSchoolId = searchParams.get("school_id");
  // Memoised supabase client. Without this, every render produced a new
  // object, the effect re-fired, and the layout got into an infinite loop
  // (audit 3.90, 3.91).
  const supabase = useSupabaseBrowser();

  // Selectors instead of `useSchoolStore()` to avoid re-rendering the
  // whole layout on any store change (audit 3.29).
  const isLoading = useSchoolStore((s) => s.isLoading);
  const hasLoaded = useSchoolStore((s) => s.hasLoaded);
  const loadError = useSchoolStore((s) => s.loadError);
  const setSchool = useSchoolStore((s) => s.setSchool);
  const setCurrentTerm = useSchoolStore((s) => s.setCurrentTerm);
  const setCurrentAcademicYear = useSchoolStore((s) => s.setCurrentAcademicYear);
  const setUser = useSchoolStore((s) => s.setUser);
  const finishLoading = useSchoolStore((s) => s.finishLoading);
  const setLoadError = useSchoolStore((s) => s.setLoadError);
  const reset = useSchoolStore((s) => s.reset);

  // Selector-based reads (audit 12.x): the previous destructure
  // `const { sidebarCollapsed, ... } = useUIStore()` subscribed to
  // the entire store, so every command-palette toggle (Cmd-K fires
  // on every keystroke) re-rendered the dashboard layout. The layout
  // is the most expensive component in the app, so this is the
  // single biggest perf footgun.
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const sidebarMobileOpen = useUIStore((s) => s.sidebarMobileOpen);
  const setSidebarMobileOpen = useUIStore((s) => s.setSidebarMobileOpen);
  const [ready, setReady] = useState(false);

  // Subscribe to cross-tab sign-out / token refresh (audit 2.8, 3.2).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        reset();
        // Hard navigation to clear all in-memory React state and avoid
        // the layout briefly showing protected data.
        window.location.href = "/login";
      }
      // For TOKEN_REFRESHED we intentionally do nothing — the existing
      // supabase client will continue to use the new access token.
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, reset]);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      // Read the session from local cookies/storage. getSession() is sync
      // (no network round-trip) and is the documented client-side check
      // for "is this user signed in". We deliberately do NOT bounce on
      // `user == null` here - the middleware is the source of truth for
      // auth, and a transient null from getUser() right after sign-in
      // was causing the post-login redirect loop. A genuine session
      // loss is caught by the 401 handling on the profile query below.
      let userId: string | undefined;
      try {
        const { data: sessionResp } = await supabase.auth.getSession();
        userId = sessionResp.session?.user?.id;
      } catch (err) {
        console.error("[dashboard layout] getSession failed", err);
        if (!cancelled) {
          setLoadError("Failed to read your session. Please try again.");
          finishLoading("Failed to read your session. Please try again.");
        }
        return;
      }

      if (!userId) {
        // Middleware would have already redirected an unauthenticated
        // request to /login. If we land here without a session, the
        // cookie expired between middleware and this effect - fall
        // through to a full-page bounce so cookies re-sync cleanly.
        window.location.href = "/login";
        return;
      }

      // Per-block try/catch so one failure doesn't leave the page in a
      // permanent loading state (audit 3.18).
      let userProfile: import("@/types").UserProfile | null = null;
      try {
        const { data, error: profileError } = await supabase
          .from("users")
          .select("id, school_id, role, full_name, phone, avatar_url, is_active, email, is_deleted")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) {
          const isAuthErr =
            profileError.code === "PGRST301" ||
            /jwt|auth/i.test(profileError.message ?? "");
          if (isAuthErr) {
            window.location.href = "/login";
            return;
          }
          throw profileError;
        }
        userProfile = data as import("@/types").UserProfile | null;
      } catch (err) {
        console.error("[dashboard layout] profile query failed", err);
        if (!cancelled) {
          const msg = "Failed to load your profile. Please try again.";
          setLoadError(msg);
          finishLoading(msg);
        }
        return;
      }

      if (cancelled) return;

      if (!userProfile) {
        window.location.href = "/login";
        return;
      }

      if (!userProfile.is_active) {
        // Sign the user out — consistent with the portal's deactivated
        // handling (audit 3.94). Without this the session cookie is
        // still valid and the user sees a stale error UI.
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error("[dashboard layout] signOut on deactivation failed", err);
        }
        window.location.href = "/login?error=deactivated";
        return;
      }

      if (userProfile.role && !["SCHOOL_ADMIN", "BURSAR"].includes(userProfile.role)) {
        const roleRedirects: Record<string, string> = {
          SUPER_ADMIN: "/admin",
          GROUP_ADMIN: "/group",
          TEACHER: "/teacher",
          PARENT: "/portal",
        };
        window.location.href = roleRedirects[userProfile.role] || "/login";
        return;
      }

      // setUser updates user + userRole atomically in a single set()
      // (audit 6.13).
      setUser(userProfile);

      const effectiveSchoolId =
        userProfile.role === "SUPER_ADMIN" && overrideSchoolId
          ? overrideSchoolId
          : userProfile.school_id;

      if (effectiveSchoolId) {
        // Audit (Bug #3): schools + terms + the academic-year join are
        // already fetched in parallel via Promise.allSettled. The only
        // true sequential step is `getSession -> profile` because the
        // profile select needs the user id. Everything downstream of
        // `userProfile` (school + term + academic year) fires as soon
        // as the profile resolves, with all three running concurrently.
        const [schoolResult, termResult] = await Promise.allSettled([
          supabase
            .from("schools")
            .select("*")
            .eq("id", effectiveSchoolId)
            .maybeSingle(),
          supabase
            .from("terms")
            .select("*, academic_years(*)")
            .eq("school_id", effectiveSchoolId)
            .eq("is_current", true)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (schoolResult.status === "fulfilled" && schoolResult.value.data) {
          setSchool(schoolResult.value.data as import("@/types").School);
        } else if (schoolResult.status === "rejected") {
          console.error("[dashboard layout] school query failed", schoolResult.reason);
        }
        if (termResult.status === "fulfilled" && termResult.value.data) {
          setCurrentTerm(termResult.value.data as import("@/types").Term);
          if (termResult.value.data.academic_years) {
            setCurrentAcademicYear(termResult.value.data.academic_years);
          }
        } else if (termResult.status === "rejected") {
          console.error("[dashboard layout] term query failed", termResult.reason);
        }
      }

      if (!cancelled) {
        finishLoading();
        setReady(true);
      }
    }

    loadContext();

    return () => {
      cancelled = true;
    };
  }, [supabase, overrideSchoolId, setSchool, setCurrentTerm, setCurrentAcademicYear, setUser, setLoadError, finishLoading]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center ring-1 ring-danger-100">
            <span className="text-danger-600 text-2xl font-bold">!</span>
          </div>
          <p className="text-heading font-medium">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg bg-bg-tertiary text-white font-semibold text-sm hover:bg-card-hover transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!ready || isLoading || !hasLoaded) {
    // Audit (Bug #3): render the layout shell (sidebar + topbar) immediately
    // and block only the main content area while loadContext runs. The
    // previous behaviour showed a fullscreen spinner, hiding the chrome
    // for 100-300ms and making the page feel slower than it is. The sidebar
    // and topbar depend only on UI state (which is already in Zustand) and
    // the cached user/role (which the auth state-change handler keeps in
    // store) — none of that needs to wait for `loadContext` to resolve.
    return (
      <div className="min-h-screen bg-bg">
        <Sidebar />
        <Topbar />
        <main
          className={cn(
            "pt-6 pb-10 px-4 sm:px-6 lg:px-8 xl:px-10 transition-all duration-300",
            sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[268px]"
          )}
        >
          <div className="max-w-[1600px] mx-auto">
            <div className="flex items-center justify-center h-64">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full border-[3px] border-border border-t-brand-600 animate-spin" />
                <p className="text-muted text-sm">Loading your dashboard…</p>
              </motion.div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <OfflineBanner />
      <AnimatePresence>
        {sidebarMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <Sidebar />
      <Topbar />
      <CommandPalette />

      <main
        className={cn(
          "pt-6 pb-10 px-4 sm:px-6 lg:px-8 xl:px-10 transition-all duration-300",
          sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[268px]"
        )}
      >
        <div className="max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-[3px] border-border border-t-brand-600 animate-spin" />
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
