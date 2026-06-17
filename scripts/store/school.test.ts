import { describe, it, expect, beforeEach } from "vitest";
import { useSchoolStore } from "@/store/school";

/**
 * Gate tests for the store changes that drive Phase 1's "page render
 * gate" (audit 2.4, 2.6, 6.13) and auth-reset (audit 2.8, 3.2, 3.67).
 */

describe("useSchoolStore", () => {
  beforeEach(() => {
    // Reset to initial state between tests.
    useSchoolStore.getState().reset();
  });

  it("starts in the loading state and not-yet-loaded", () => {
    const s = useSchoolStore.getState();
    expect(s.isLoading).toBe(true);
    expect(s.hasLoaded).toBe(false);
    expect(s.loadError).toBeNull();
  });

  it("setUser updates user and userRole atomically (audit 6.13)", () => {
    const user = {
      id: "u1",
      school_id: "s1",
      role: "SCHOOL_ADMIN" as const,
      full_name: "Test Admin",
      phone: null,
      email: null,
      avatar_url: null,
      is_active: true,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      is_deleted: false,
    };
    useSchoolStore.getState().setUser(user);
    const s = useSchoolStore.getState();
    expect(s.user).toEqual(user);
    expect(s.userRole).toBe("SCHOOL_ADMIN");
  });

  it("setUser(null) clears user and userRole together (no torn state)", () => {
    useSchoolStore.getState().setUser({
      id: "u1",
      school_id: null,
      role: "PARENT",
      full_name: "x",
      phone: null,
      email: null,
      avatar_url: null,
      is_active: true,
      created_at: "",
      updated_at: "",
      is_deleted: false,
    });
    useSchoolStore.getState().setUser(null);
    const s = useSchoolStore.getState();
    expect(s.user).toBeNull();
    expect(s.userRole).toBeNull();
  });

  it("setCurrentTerm mirrors the value into the term alias", () => {
    const term = {
      id: "t1",
      school_id: "s1",
      academic_year_id: "y1",
      name: "Term1" as const,
      start_date: null,
      end_date: null,
      is_current: true,
      created_at: "",
      updated_at: "",
      is_deleted: false,
    };
    useSchoolStore.getState().setCurrentTerm(term);
    const s = useSchoolStore.getState();
    expect(s.currentTerm).toEqual(term);
    expect(s.term).toEqual(term);
  });

  it("finishLoading transitions isLoading=false, hasLoaded=true", () => {
    useSchoolStore.getState().finishLoading();
    const s = useSchoolStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.hasLoaded).toBe(true);
    expect(s.loadError).toBeNull();
  });

  it("finishLoading with an error message surfaces it in loadError", () => {
    useSchoolStore.getState().finishLoading("boom");
    const s = useSchoolStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.hasLoaded).toBe(true);
    expect(s.loadError).toBe("boom");
  });

  it("reset returns the store to its initial loading state", () => {
    useSchoolStore.getState().setUser({
      id: "u1",
      school_id: "s1",
      role: "BURSAR",
      full_name: "x",
      phone: null,
      email: null,
      avatar_url: null,
      is_active: true,
      created_at: "",
      updated_at: "",
      is_deleted: false,
    });
    useSchoolStore.getState().finishLoading();
    useSchoolStore.getState().reset();
    const s = useSchoolStore.getState();
    expect(s.user).toBeNull();
    expect(s.userRole).toBeNull();
    expect(s.school).toBeNull();
    expect(s.isLoading).toBe(true);
    expect(s.hasLoaded).toBe(false);
    expect(s.loadError).toBeNull();
  });
});
