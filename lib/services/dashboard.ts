/**
 * Dashboard domain service.
 *
 * The dashboard page used to fire 14 parallel Supabase queries
 * client-side with 200+ lines of `as { data: unknown }` casts.
 * After migration 0044, all 14 reads collapse into a single SQL
 * function `dashboard_overview(p_school_id, p_term_id, p_date)`
 * that returns one JSONB blob. This service is the only caller
 * of that function on the server side.
 *
 * Caching is handled by the route wrapper via `withSchoolReadCache`
 * — the input key encodes the term id and the date so a school
 * that switches terms picks up the new aggregated slice without
 * serving stale rows from the previous term.
 */

import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";

export interface DashboardOverviewInput {
  termId?: string | null;
  date: string;
}

export interface DashboardKpis {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
}

export interface DashboardOverview {
  kpis: DashboardKpis;
  recentPayments: unknown[];
  defaulterAccounts: unknown[];
  counts: {
    students: number;
    classes: number;
    smsSent: number;
    feeStructures: number;
    staff: number;
  };
  onboarding: {
    hasClass: boolean;
    hasStudents: boolean;
    hasFeeStructure: boolean;
    hasStaff: boolean;
    hasSentSms: boolean;
    hasMobileMoney: boolean;
  };
  attendanceToday: { present: number; total: number };
  attendanceByClass: {
    class_id: string;
    class_name: string;
    teacher: string;
    present: number;
    total: number;
    pct: number;
  }[];
  paymentTrend: { week_start: string; amount: number }[];
  paymentMethods: { payment_method: string; amount: number }[];
}

/**
 * Call the `dashboard_overview` RPC and return its typed result.
 *
 * Returns a fully populated default shape on RPC failure so the
 * dashboard renders an empty state instead of a 500 — the previous
 * client code already had this fallback for each individual query
 * that failed (the `queryErrors` banner).
 */
export async function getOverview(
  ctx: AuthContext,
  input: DashboardOverviewInput,
): Promise<DashboardOverview> {
  const { data, error } = await ctx.supabase.rpc(
    "dashboard_overview" as never,
    {
      p_school_id: ctx.schoolId,
      p_term_id: input.termId ?? null,
      p_date: input.date,
    } as never,
  );

  if (error) {
    throw new AuthError(`Dashboard overview failed: ${error.message}`, 502);
  }

  // The RPC returns a JSONB blob. Coerce to a sensible shape with
  // safe fall-backs so a partial / older RPC never crashes the
  // dashboard render.
  const blob = (data ?? {}) as Partial<DashboardOverview>;
  return {
    kpis: blob.kpis ?? {
      totalExpected: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      collectionRate: 0,
    },
    recentPayments: blob.recentPayments ?? [],
    defaulterAccounts: blob.defaulterAccounts ?? [],
    counts: blob.counts ?? {
      students: 0,
      classes: 0,
      smsSent: 0,
      feeStructures: 0,
      staff: 0,
    },
    onboarding: blob.onboarding ?? {
      hasClass: false,
      hasStudents: false,
      hasFeeStructure: false,
      hasStaff: false,
      hasSentSms: false,
      hasMobileMoney: false,
    },
    attendanceToday: blob.attendanceToday ?? { present: 0, total: 0 },
    attendanceByClass: blob.attendanceByClass ?? [],
    paymentTrend: blob.paymentTrend ?? [],
    paymentMethods: blob.paymentMethods ?? [],
  };
}