import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeAuditLog } from "@/lib/audit-log";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Audit 2.14 (3.33): the previous `as any` casts for audit_logs were
 * scattered across the codebase. The helper centralises the cast and
 * must never throw out of a write — a failed audit row should not
 * fail the user action.
 */

function makeSupabase() {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    from: () => ({ insert }),
    _insert: insert,
  } as unknown as SupabaseClient<never> & { _insert: ReturnType<typeof vi.fn> };
}

describe("writeAuditLog (audit 2.14, 3.33)", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("calls supabase.from('audit_logs').insert with the typed payload", async () => {
    const sb = makeSupabase();
    await writeAuditLog(sb, {
      school_id: "s1",
      user_id: "u1",
      action: "test_action",
      entity_type: "test",
      entity_id: "e1",
      new_value: { foo: 1 },
    });
    expect(sb._insert).toHaveBeenCalledOnce();
    const args = sb._insert.mock.calls[0][0] as Record<string, unknown>;
    expect(args.school_id).toBe("s1");
    expect(args.user_id).toBe("u1");
    expect(args.action).toBe("test_action");
    expect(args.entity_type).toBe("test");
    expect(args.entity_id).toBe("e1");
    expect(args.new_value).toEqual({ foo: 1 });
    expect(args.old_value).toBeNull();
  });

  it("does NOT throw when the insert rejects", async () => {
    const sb = {
      from: () => ({
        insert: () => Promise.reject(new Error("db down")),
      }),
    } as unknown as SupabaseClient<never>;
    // Must not throw
    await expect(
      writeAuditLog(sb, {
        school_id: "s1",
        user_id: "u1",
        action: "x",
        entity_type: "x",
        entity_id: null,
      }),
    ).resolves.toBeUndefined();
    // Failure was logged
    expect(errSpy).toHaveBeenCalledOnce();
  });

  it("omits new_value and old_value when not provided", async () => {
    const sb = makeSupabase();
    await writeAuditLog(sb, {
      school_id: "s1",
      user_id: "u1",
      action: "view",
      entity_type: "page",
      entity_id: null,
    });
    const args = sb._insert.mock.calls[0][0] as Record<string, unknown>;
    expect(args.new_value).toBeNull();
    expect(args.old_value).toBeNull();
  });
});
