/**
 * hooks/use-portal-data.ts
 *
 * AP-1 fix: Replaces 9 useEffect+fetch patterns across portal pages
 * with React Query hooks that provide:
 *   - Automatic retry (once on 5xx, never on 4xx)
 *   - Background refresh (staleTime: 60s matches server LRU)
 *   - Cache sharing between pages (notification badge + full list)
 *   - Proper loading/error states
 *   - No memory leaks (no manual cleanup needed)
 *   - Optimistic updates on read (mark-as-read stays instant)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface PortalMessage {
  id: string;
  source: 'sms' | 'in_app';
  title?: string;
  body: string;
  sent_at: string;
  is_read: boolean;
  type: string;
}

export interface PortalAttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  class: { name: string } | null;
  notes: string | null;
}

export interface PortalFeeAccount {
  id: string;
  term_id: string;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  term: { name: string; start_date: string; end_date: string } | null;
}

export interface PortalMeetingTeacher {
  id: string;
  full_name: string;
  avatar_url: string | null;
  subject?: string;
}

export interface PortalMeetingSlot {
  id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  teacher: { full_name: string } | null;
}

export interface PortalMeeting {
  id: string;
  slot_id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  meeting_date: string;
  notes: string | null;
  teacher: { full_name: string } | null;
  slot: { start_time: string; end_time: string } | null;
}

// ── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), {
      status: res.status,
    });
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function usePortalNotifications() {
  return useQuery({
    queryKey: ['portal-notifications'],
    queryFn: () => apiFetch<PortalNotification[]>('/api/portal/notifications'),
    staleTime: 60_000,
    retry: (count, err) => {
      const status = (err as { status?: number }).status ?? 0;
      if (status >= 400 && status < 500) return false;
      return count < 1;
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const notifKey = ['portal-notifications'];

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/portal/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to mark as read');
    },
    // Optimistic update: mark as read instantly, revert on error
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: notifKey });
      const prev = qc.getQueryData<PortalNotification[]>(notifKey);
      qc.setQueryData<PortalNotification[]>(notifKey, (old) =>
        (old ?? []).map((n) =>
          ids.includes(n.id) ? { ...n, is_read: true } : n,
        ),
      );
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(notifKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notifKey });
    },
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function usePortalMessages() {
  return useQuery({
    queryKey: ['portal-messages'],
    queryFn: () => apiFetch<PortalMessage[]>('/api/portal/messages'),
    staleTime: 60_000,
  });
}

// ── Attendance ────────────────────────────────────────────────────────────────

export function usePortalAttendance(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal-attendance', studentId],
    queryFn: () =>
      apiFetch<PortalAttendanceRecord[]>(
        `/api/portal/attendance?student_id=${studentId}`,
      ),
    enabled: !!studentId,
    staleTime: 2 * 60_000, // attendance data changes once per day
  });
}

// ── Fee Accounts ──────────────────────────────────────────────────────────────

export function usePortalFeeAccounts(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal-fees', studentId],
    queryFn: () =>
      apiFetch<PortalFeeAccount[]>(
        `/api/portal/fees?student_id=${studentId}`,
      ),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}

export function usePortalFeeTypes() {
  return useQuery({
    queryKey: ['portal-fee-types'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/api/v1/fee-types'),
    staleTime: 10 * 60_000, // fee types rarely change
    gcTime: 24 * 60 * 60_000,
  });
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export function usePortalMeetingTeachers(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal-meeting-teachers', studentId],
    queryFn: () =>
      apiFetch<PortalMeetingTeacher[]>(
        `/api/portal/meetings/teachers?student_id=${studentId}`,
      ),
    enabled: !!studentId,
    staleTime: 5 * 60_000,
  });
}

export function usePortalMeetingSlots(
  teacherId: string | undefined,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: ['portal-meeting-slots', teacherId, studentId],
    queryFn: () =>
      apiFetch<PortalMeetingSlot[]>(
        `/api/portal/meetings/slots?teacher_id=${teacherId}&student_id=${studentId}`,
      ),
    enabled: !!teacherId && !!studentId,
    staleTime: 60_000,
  });
}

export function usePortalMeetings(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal-meetings', studentId],
    queryFn: () =>
      apiFetch<PortalMeeting[]>(
        `/api/portal/meetings?student_id=${studentId}`,
      ),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}

export function useBookMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      slot_id: string;
      student_id: string;
      notes?: string;
    }) => {
      const res = await fetch('/api/portal/meetings/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Booking failed');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['portal-meetings', vars.student_id] });
      qc.invalidateQueries({
        queryKey: ['portal-meeting-slots', undefined, vars.student_id],
      });
    },
  });
}
