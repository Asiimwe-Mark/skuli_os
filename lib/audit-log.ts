import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuthContext } from "@/lib/http";

type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

/**
 * Strongly-typed audit log helper.
 *
 * audit_logs.Insert now includes user_agent (added in migration 0032),
 * so we no longer need `as never` / `as any` casts here or at call sites.
 *
 * Failures are swallowed deliberately: a missing audit row must never
 * roll back a real business transaction. Logged to stderr so it remains
 * observable in server logs.
 */
export interface AuditLogEntry {
  school_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  /** Snapshot of the record after the change. */
  new_value?: Record<string, unknown> | null;
  /** Snapshot of the record before the change. */
  old_value?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  entry: AuditLogEntry,
): Promise<void> {
  try {
    const payload: AuditLogInsert = {
      school_id: entry.school_id,
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      new_value: (entry.new_value ?? null) as AuditLogInsert["new_value"],
      old_value: (entry.old_value ?? null) as AuditLogInsert["old_value"],
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
    };

    const { error } = await supabase.from("audit_logs").insert(payload);

    if (error) {
      console.error("[audit-log] insert failed", { action: entry.action, error });
    }
  } catch (err) {
    // Never throw out of an audit write.
    console.error("[audit-log] unexpected error", { action: entry.action, err });
  }
}

/**
 * Higher-order helper that wraps a business operation in audit
 * logging. The wrapped function runs first; on success we record
 * the action, on failure we record `<action>_failed` with the
 * error message and re-throw.
 *
 * Use this when the audit must reflect both the successful state
 * AND any partial failure (e.g. a fee payment that recorded but
 * then failed to send a push notification). For single-step
 * mutations a plain `writeAuditLog(...)` is enough.
 *
 * The audit write itself is best-effort (same as `writeAuditLog`),
 * so an audit failure cannot abort the business operation.
 */
export async function withAudit<T>(
  ctx: AuthContext,
  args: {
    action: string;
    entityType: string;
    entityId: string | null;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: args.action,
      entity_type: args.entityType,
      entity_id: args.entityId,
      old_value: args.oldValue ?? null,
      new_value: args.newValue ?? null,
    });
    return result;
  } catch (err) {
    // Audit on failure too, but never swallow the original error.
    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: `${args.action}_failed`,
      entity_type: args.entityType,
      entity_id: args.entityId,
      old_value: args.oldValue ?? null,
      new_value: {
        ...(args.newValue ?? {}),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}