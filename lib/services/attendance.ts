/**
 * Attendance domain service.
 *
 * Encapsulates the attendance submission flow. The route handler
 * used to:
 *
 *   • Verify the class belongs to the school
 *   • Build N insert rows
 *   • `upsert(records, { onConflict: "student_id,date" })` — one
 *     round-trip per student under the hood
 *   • Filter the absent list, fetch students + parent users,
 *     sequentially send web-push notifications (one network
 *     round-trip per absent student)
 *   • Write audit log
 *   • Synchronously invalidate the school cache
 *
 * This service replaces all of that with:
 *
 *   • One SQL batch via the new `upsert_attendance_batch` RPC
 *     (migration 0046)
 *   • Parallel push notifications via `Promise.allSettled`
 *   • Fire-and-forget cache invalidation via
 *     `invalidateSchoolAsync`
 */

import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { sendPushToUser } from "@/lib/push";
import { scopedQuery } from "@/lib/http/scoped";

export interface AttendanceRecordInput {
  student_id: string;
  status: "present" | "absent" | "late" | "excused";
  notes?: string | null;
}

export interface SubmitAttendanceInput {
  class_id: string;
  date: string;
  term_id?: string | null;
  records: AttendanceRecordInput[];
}

export interface SubmitAttendanceResult {
  records: { id: string; student_id: string; class_id: string; date: string; status: string }[];
  absent_count: number;
}

/**
 * Resolve the term_id for an attendance submission. We require the
 * client to pass it (the form already knows the current term), but
 * fall back to a server-side lookup when the client omitted it.
 */
async function resolveTermId(ctx: AuthContext): Promise<string | null> {
  const { data } = await scopedQuery(ctx, "terms")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Submit attendance for a single class + date. Returns the upserted
 * rows and the absent count. Pushes notifications fire in parallel
 * after the SQL has committed, so a slow push worker cannot block
 * the response.
 */
export async function submitAttendance(
  ctx: AuthContext,
  input: SubmitAttendanceInput,
): Promise<SubmitAttendanceResult> {
  // Verify the class belongs to the school — RLS would catch this
  // too, but an explicit 400 keeps the error message school-
  // friendly.
  const { data: cls } = await scopedQuery(ctx, "classes")
    .select("id")
    .eq("id", input.class_id)
    .maybeSingle();
  if (!cls) {
    throw new AuthError("Invalid class for this school", 400);
  }

  const termId = input.term_id ?? (await resolveTermId(ctx));

  // Single batched RPC. Returns the row count; we re-read the rows
  // so the response matches the previous shape (`records: ...`).
  const recordsJson = input.records.map((r) => ({
    student_id: r.student_id,
    status: r.status,
    notes: r.notes ?? null,
  }));

  const { error: rpcError } = await ctx.supabase.rpc(
    "upsert_attendance_batch" as never,
    {
      p_school_id: ctx.schoolId,
      p_class_id: input.class_id,
      p_date: input.date,
      p_term_id: termId,
      p_records: recordsJson,
    } as never,
  );
  if (rpcError) {
    throw new AuthError(`Failed to record attendance: ${rpcError.message}`, 400);
  }

  // Re-read the rows we just upserted so the response includes the
  // generated ids + the persisted status.
  const { data: persisted } = await scopedQuery(ctx, "attendance_records")
    .select("id, student_id, class_id, date, status")
    .eq("class_id", input.class_id)
    .eq("date", input.date);

  const absentRecords = input.records.filter((r) => r.status === "absent");
  const absentIds = absentRecords.map((r) => r.student_id);

  // Audit log first so a failure here does not block the push
  // fan-out.
  await writeAuditLog(ctx.supabase, {
    school_id: ctx.schoolId,
    user_id: ctx.user.id,
    action: "attendance_taken",
    entity_type: "attendance_record",
    entity_id: null,
    new_value: {
      class_id: input.class_id,
      date: input.date,
      total: input.records.length,
      absent: absentRecords.length,
    },
  });

  // Push to parents — parallel, best-effort, never blocks.
  if (absentIds.length > 0) {
    void pushAbsentNotifications(ctx, input.class_id, input.date, absentRecords).catch((err) => {
      console.error("[attendance] push fan-out failed", err);
    });
  }

  invalidateSchoolAsync(ctx.schoolId);

  return {
    records: (persisted ?? []) as SubmitAttendanceResult["records"],
    absent_count: absentRecords.length,
  };
}

async function pushAbsentNotifications(
  ctx: AuthContext,
  classId: string,
  date: string,
  absentRecords: AttendanceRecordInput[],
): Promise<void> {
  const { data: students } = await ctx.supabase
    .from("students")
    .select("id, full_name, parent_phone")
    .in("id", absentRecords.map((r) => r.student_id));
  if (!students || students.length === 0) return;

  const phones = students
    .map((s) => s.parent_phone)
    .filter((p): p is string => !!p);
  if (phones.length === 0) return;

  const { data: parentUsers } = await ctx.supabase
    .from("users")
    .select("id, phone")
    .eq("school_id", ctx.schoolId)
    .eq("role", "PARENT")
    .in("phone", phones);
  if (!parentUsers || parentUsers.length === 0) return;

  const phoneToParent = new Map(
    parentUsers
      .filter((p): p is { id: string; phone: string } => !!p.phone)
      .map((p) => [p.phone, p.id]),
  );
  const studentById = new Map(
    students.map((s) => [s.id, s]),
  );

  const promises: Promise<void>[] = [];
  for (const record of absentRecords) {
    const student = studentById.get(record.student_id);
    if (!student?.parent_phone) continue;
    const parentUserId = phoneToParent.get(student.parent_phone);
    if (!parentUserId) continue;
    promises.push(
      sendPushToUser(ctx.supabase, parentUserId, {
        title: "Absence Alert",
        body: `${student.full_name} marked absent on ${date}`,
        url: "/portal",
      }).then(() => undefined),
    );
  }
  void classId; // reserved for future class-specific push link
  await Promise.allSettled(promises);
}