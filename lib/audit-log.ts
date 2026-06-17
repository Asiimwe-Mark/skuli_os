import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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