/**
 * Gate tests for the students route's TEACHER role-guard
 * (audit 3.4, 4.8).
 *
 * Before Phase 3B, a TEACHER with a school_id could read the full
 * student list. After: a TEACHER only sees students in classes
 * where they teach a subject (per class_subjects.teacher_id).
 * A TEACHER who also passes a class_id query param that isn't in
 * their class list gets 403 — they can't snoop on other classes
 * by guessing UUIDs.
 */
import { describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};
// What class_subjects.teacher_id rows look like for the test user.
// Each entry is a class the teacher teaches.
type ClassSubjectRow = { class_id: string };
// Captured supabase calls so we can assert the .in() filter shape.
let lastInFilter: { column: string; ids: string[] } | null = null;

const mockState: {
  current: Profile | null;
  teacherClasses: ClassSubjectRow[];
} = { current: null, teacherClasses: [] };

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) {
        throw new AuthError("test not configured", 500);
      }
      const profile = mockState.current;

      // Each `from()` returns a per-table chain. The route does
      // several things:
      //  1. For TEACHER only: class_subjects lookup → return teacherClasses
      //  2. students select with optional .in("current_class_id", [...])
      //     → return empty
      // The captured `lastInFilter` lets the test assert that the
      // teacher-scoped .in() was applied.
      const classSubjectsChain: Record<string, unknown> = {};
      classSubjectsChain.select = () => classSubjectsChain;
      classSubjectsChain.eq = () => classSubjectsChain;
      classSubjectsChain.is = () => classSubjectsChain;
      classSubjectsChain.maybeSingle = async () => ({ data: null, error: null });
      // The class_subjects call uses .select(...).eq(...).eq(...).
      // .eq("teacher_id", ctx.user.id) → we return teacherClasses
      // on the FIRST eq's eventual await. The chain captures each eq
      // call; the route's pattern is:
      //   .select("class_id").eq("teacher_id", id).eq("is_deleted", false)
      // We model the final resolution: returning the configured
      // classes from the chain's await path.
      // Simpler: when .then() is awaited on the chain, return the rows.
      // But there is no .then in our chain — the route awaits directly
      // on a non-thenable. The cleanest portable stub: override the
      // chain so that calling `await chain` (i.e. treating it as a
      // thenable) returns the rows. The supabase-js client chain
      // resolves the terminal call (eq) into the awaited response.
      // We mark `eq` as both chainable AND thenable for the last call.
      let eqCallCount = 0;
      const teacherClassesCopy = () => mockState.teacherClasses;
      classSubjectsChain.eq = (..._args: unknown[]) => {
        eqCallCount++;
        // On the last .eq() in the chain, return a thenable that
        // resolves to the teacher's classes. (The route does
        // .select().eq().eq() then awaits.)
        if (eqCallCount >= 2) {
          return {
            then(onFulfilled: (v: unknown) => void) {
              return Promise.resolve({ data: teacherClassesCopy(), error: null }).then(onFulfilled);
            },
          };
        }
        return classSubjectsChain;
      };
      classSubjectsChain.is = (..._args: unknown[]) => classSubjectsChain;

      const studentsChain: Record<string, unknown> = {};
      studentsChain.select = () => studentsChain;
      studentsChain.eq = () => studentsChain;
      studentsChain.in = (column: string, ids: string[]) => {
        lastInFilter = { column, ids };
        return studentsChain;
      };
      studentsChain.or = () => studentsChain;
      studentsChain.order = () => studentsChain;
      studentsChain.range = () => studentsChain;
      // Terminal await on the students chain
      studentsChain.then = (onFulfilled: (v: unknown) => void) => {
        return Promise.resolve({ data: [], count: 0, error: null }).then(onFulfilled);
      };

      return {
        supabase: {
          from: (table: string) => {
            if (table === "class_subjects") return classSubjectsChain;
            if (table === "students") return studentsChain;
            return studentsChain;
          },
        } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { GET as studentsGET } from "@/app/api/students/route";

function fakeRequest(url = "http://test.local/") {
  return new Request(url, { method: "GET" });
}

function setProfile(role: string, school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.teacherClasses = [];
  lastInFilter = null;
}

describe("GET /api/students — TEACHER role guard (audit 3.4, 4.8)", () => {
  it("returns 403 when called as PARENT", async () => {
    setProfile("PARENT");
    const res = await studentsGET(fakeRequest() as never);
    expect(res.status).toBe(403);
  });

  it("returns 200 with empty result for a TEACHER who teaches no classes", async () => {
    setProfile("TEACHER");
    mockState.teacherClasses = [];
    const res = await studentsGET(fakeRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Teacher with no classes → empty list, total 0
    expect(json.data.students).toEqual([]);
    expect(json.data.total).toBe(0);
  });

  it("scopes students to the TEACHER's classes via .in() filter", async () => {
    setProfile("TEACHER");
    mockState.teacherClasses = [
      { class_id: "c1" },
      { class_id: "c2" },
    ];
    const res = await studentsGET(fakeRequest() as never);
    expect(res.status).toBe(200);
    // The route must have applied the .in() on current_class_id
    // with the teacher's class list.
    expect(lastInFilter).not.toBeNull();
    expect(lastInFilter?.column).toBe("current_class_id");
    expect(lastInFilter?.ids.sort()).toEqual(["c1", "c2"]);
  });

  it("returns 403 when a TEACHER passes a class_id outside their classes", async () => {
    setProfile("TEACHER");
    mockState.teacherClasses = [{ class_id: "c1" }];
    const res = await studentsGET(
      fakeRequest("http://test.local/?class_id=c-other") as never,
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("does NOT apply the .in() filter for SCHOOL_ADMIN (full list)", async () => {
    setProfile("SCHOOL_ADMIN");
    const res = await studentsGET(fakeRequest() as never);
    expect(res.status).toBe(200);
    // SCHOOL_ADMIN sees everything; the .in() should not have been
    // called.
    expect(lastInFilter).toBeNull();
  });
});
