function toDate(date: string | Date | null | undefined): Date | null {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Audit 10.14: the previous code used
 *   new Date().toISOString().split("T")[0]
 * in many places to get "today" as a YYYY-MM-DD string for
 * <input type="date"> or `eq("date", ...)` filters. That gives
 * the UTC date, which can be off by one day for users east or
 * west of UTC. For a school in Uganda (UTC+3), a 02:00 local
 * "now" becomes the previous UTC day and the date picker
 * silently shows yesterday.
 *
 * This helper returns the local YYYY-MM-DD. Use it for any
 * "today" bound on a date input or `eq("date", ...)` filter
 * that represents the user's calendar day, not a server-side
 * timestamp.
 */
export function todayLocalISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Inverse of toISOString().split("T")[0]. When the caller has
 * a Date they want to display in a date input as their local
 * day (not UTC), use this. Equivalent to todayLocalISODate(date).
 */
export function toLocalISODate(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return "";
  return todayLocalISODate(d);
}

export function formatDate(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function isToday(date: string | Date | null | undefined): boolean {
  const d = toDate(date);
  if (!d) return false;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function getDaysSince(date: string | Date | null | undefined): number {
  const d = toDate(date);
  if (!d) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}
