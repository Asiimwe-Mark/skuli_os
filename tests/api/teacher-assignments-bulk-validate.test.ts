/**
 * Gate tests for /api/teacher/assignments POST (audit 4.10).
 *
 * The previous flow validated each class/subject with a separate
 * round-trip in a for-loop (one per assignment). For 20
 * assignments that's 20+ round-trips. The route now collects
 * unique IDs and validates them with 2 .in() queries
 * (classes + subjects) regardless of how many assignments
 * the client sends.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/api-helpers";

type Profile = {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string;
};

const mockState: {
  current: Profile | null;
  // Captures every .from(table) call, in order.
  fromCalls: string[];
  // .in() column captures for assertions.
  inCalls: { table: string; column: string }[];
  fromQueues: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
} = {
  current: null,
  fromCalls: [],
  inCalls: [],
  fromQueues: {},
};

vi.mock("@/lib/api-helpers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getSupabaseAndUser: async () => {
      if (!mockState.current) throw new AuthError("test not configured", 500);
      const profile = mockState.current;
      const from = (table: string) => {
        mockState.fromCalls.push(table);
        const queue = mockState.fromQueues[table] ?? [];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = (column: string, _values: unknown[]) => {
          mockState.inCalls.push({ table, column });
          // Return a thenable that resolves the queue head.
          return {
            then: (onFulfilled: (v: unknown) => void) =>
              Promise.resolve(queue.shift() ?? { data: [], error: null }).then(onFulfilled),
          };
        };
        chain.insert = () => ({
          select: () => Promise.resolve({ data: [{ id: "x" }], error: null }),
        });
        chain.update = () => {
          const upd: Record<string, unknown> = {};
          upd.eq = () => upd;
          upd.then = (onFulfilled: (v: unknown) => void) =>
            Promise.resolve({ error: null }).then(onFulfilled);
          return upd;
        };
        chain.single = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        chain.maybeSingle = () => {
          const next = queue.shift();
          return Promise.resolve(next ?? { data: null, error: null });
        };
        return chain;
      };
      return {
        supabase: { from } as never,
        user: { id: profile.id },
        profile,
      };
    },
  };
});

import { POST } from "@/app/api/teacher/assignments/route";

const TEACHER_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const CLASS_UUID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const SUBJECT_UUID = "c3d4e5f6-a7b8-4c9d-9e1f-2a3b4c5d6e7f";

function fakePost(body: unknown) {
  return new Request("http://test.local/api/teacher/assignments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function setProfile(role = "SCHOOL_ADMIN", school_id: string | null = "s1") {
  mockState.current = { id: "u1", school_id, role, full_name: role };
  mockState.fromCalls = [];
  mockState.inCalls = [];
  mockState.fromQueues = {};
}

beforeEach(() => setProfile());

describe("POST /api/teacher/assignments — bulk validation (audit 4.10)", () => {
  it("returns 403 for TEACHER (only SCHOOL_ADMIN)", async () => {
    setProfile("TEACHER");
    const res = await POST(
      fakePost({
        teacher_id: TEACHER_UUID,
        assignments: [{ class_id: CLASS_UUID }],
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for malformed input", async () => {
    const res = await POST(
      fakePost({ teacher_id: "not-a-uuid" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("uses ONE classes .in() and ONE subjects .in() to validate the entire batch (audit 4.10)", async () => {
    // 5 assignments across 3 unique classes and 2 unique subjects.
    // Previously the route did 5 classes lookups + 2 subjects
    // lookups = 7 round-trips. Now: 1 + 1 = 2.
    setProfile();
    mockState.fromQueues = {
      users: [{ data: { id: TEACHER_UUID }, error: null }],
      classes: [
        {
          data: [
            { id: CLASS_UUID },
            { id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70" },
            { id: "e5f6a7b8-c9d0-4e1f-a021-3b4c5d6e7f81" },
          ],
          error: null,
        },
      ],
      subjects: [
        {
          data: [{ id: SUBJECT_UUID }],
          error: null,
        },
      ],
    };

    const res = await POST(
      fakePost({
        teacher_id: TEACHER_UUID,
        assignments: [
          { class_id: CLASS_UUID, subject_id: SUBJECT_UUID, is_class_teacher: false },
          { class_id: CLASS_UUID, subject_id: SUBJECT_UUID, is_class_teacher: false },
          { class_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70", subject_id: SUBJECT_UUID, is_class_teacher: false },
          { class_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70", is_class_teacher: true },
          { class_id: "e5f6a7b8-c9d0-4e1f-a021-3b4c5d6e7f81", is_class_teacher: false },
        ],
      }) as never,
    );
    expect(res.status).toBe(200);

    const classesInCalls = mockState.inCalls.filter((c) => c.table === "classes");
    const subjectsInCalls = mockState.inCalls.filter((c) => c.table === "subjects");
    expect(classesInCalls).toHaveLength(1);
    expect(subjectsInCalls).toHaveLength(1);
    expect(classesInCalls[0].column).toBe("id");
    expect(subjectsInCalls[0].column).toBe("id");
  });

  it("returns 400 'Invalid class for this school' when an unknown class is in the batch", async () => {
    setProfile();
    mockState.fromQueues = {
      users: [{ data: { id: TEACHER_UUID }, error: null }],
      // classes .in() returns only CLASS_UUID; the route
      // detects "d4e5f6a7-..." is missing.
      classes: [{ data: [{ id: CLASS_UUID }], error: null }],
      subjects: [{ data: [], error: null }],
    };
    const res = await POST(
      fakePost({
        teacher_id: TEACHER_UUID,
        assignments: [
          { class_id: CLASS_UUID, is_class_teacher: false },
          { class_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70", is_class_teacher: false },
        ],
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error ?? json.message).toBe("Invalid class for this school");
  });
});
