/**
 * Centralised query-key factory for the entire app.
 *
 * Why this exists
 * ---------------
 * The audit (Bug #4, Bug #5) found 17+ queries with keys missing
 * `school?.id` and many mutations invalidating only their own page's
 * query, leaving downstream KPIs stale. Both classes of bug share a
 * single root cause: ad-hoc string keys scattered across 40+ files.
 *
 * Two problems with ad-hoc keys:
 *   1. `queryKey: ['expenses', currentTerm?.id]` — when term is not
 *      yet loaded the key is `['expenses', undefined]`, which runs,
 *      caches an empty result, and is then re-fetched with a new key
 *      when the term arrives. Worse, the same key is reused across
 *      schools, so a SUPER_ADMIN switching schools sees School A's
 *      expenses in School B's view.
 *   2. `invalidateQueries({ queryKey: ['expenses'] })` — this is a
 *      prefix match that nukes every expense query for every school
 *      in the cache, not just the current school.
 *
 * The fix: every key is built by a function that requires a school
 * id, every mutation that touches school-scoped data invalidates
 * through this module, and `invalidateQueries` is always called with
 * a fully-qualified key, never a bare prefix.
 *
 * The `as const` on each factory makes the return type narrow so
 * React Query can match it as a literal tuple, not a widened string
 * array — that lets `invalidateQueries({ queryKey: queryKeys.expenses(schoolId) })`
 * match the cache entry that was inserted by
 * `useQuery({ queryKey: queryKeys.expenses(schoolId) })`.
 */

type TermId = string | undefined;
type Filters = readonly unknown[];

/**
 * Build a readonly tuple for use as a React Query key.
 *
 * The return type is a generic tuple (`readonly [string, T, U?]`) so
 * that `as const` on the call site produces a literal-tuple type that
 * React Query can match exactly. With `unknown[]` TS rejects `as
 * const` on a function call (TS1355).
 */
function join<const T extends readonly unknown[]>(...parts: T): T {
  return parts;
}

export const queryKeys = {
  // ---- Dashboard ----
  dashboard: (schoolId: string, termId?: TermId) =>
    join("dashboard", schoolId, termId),

  // ---- Students ----
  students: (schoolId: string, ...filters: Filters) =>
    join("students", schoolId, ...filters),
  student: (schoolId: string, studentId: string) =>
    join("students", schoolId, studentId),
  terms: (schoolId: string) =>
    join("terms", schoolId),
  classes: (schoolId: string) =>
    join("classes", schoolId),
  enroll: (schoolId: string) =>
    join("enroll", schoolId),
  promote: (schoolId: string) =>
    join("promote", schoolId),

  // ---- Fees ----
  feesIndex: (schoolId: string, termId?: TermId) =>
    join("fees-index", schoolId, termId),
  feeStructures: (schoolId: string, termId?: TermId) =>
    join("fee-structures", schoolId, termId),
  feeAccounts: (schoolId: string, termId?: TermId) =>
    join("fee-accounts", schoolId, termId),
  feeDefaulters: (schoolId: string, termId?: TermId) =>
    join("fee-defaulters", schoolId, termId),
  feePayments: (schoolId: string, termId?: TermId) =>
    join("fee-payments", schoolId, termId),
  feeReceipts: (schoolId: string, termId?: TermId) =>
    join("fee-receipts", schoolId, termId),
  feeDiscounts: (schoolId: string, termId?: TermId) =>
    join("fee-discounts", schoolId, termId),
  feeStatements: (schoolId: string, termId?: TermId) =>
    join("fee-statements", schoolId, termId),
  feePaymentsIncome: (schoolId: string, termId?: TermId) =>
    join("fee-payments-income", schoolId, termId),
  feesReports: (schoolId: string, termId?: TermId) =>
    join("fees-reports", schoolId, termId),

  // ---- Expenses ----
  expenses: (schoolId: string, termId?: TermId) =>
    join("expenses", schoolId, termId),
  expenseCategories: (schoolId: string) =>
    join("expense-categories", schoolId),

  // ---- Attendance ----
  attendanceOverview: (schoolId: string, date?: string) =>
    join("attendance-overview", schoolId, date),
  attendanceStudents: (schoolId: string, classId?: string, date?: string) =>
    join("attendance-students", schoolId, classId, date),
  attendanceClassList: (schoolId: string, classId: string, date: string) =>
    join("attendance-class-list", schoolId, classId, date),

  // ---- Academics ----
  subjects: (schoolId: string) =>
    join("subjects", schoolId),
  marks: (schoolId: string, ...filters: Filters) =>
    join("marks", schoolId, ...filters),
  marksReview: (schoolId: string, ...filters: Filters) =>
    join("marks-review", schoolId, ...filters),
  timetable: (schoolId: string) =>
    join("timetable", schoolId),
  calendar: (schoolId: string) =>
    join("calendar", schoolId),
  reportCards: (schoolId: string, ...filters: Filters) =>
    join("report-cards", schoolId, ...filters),

  // ---- Staff ----
  staff: (schoolId: string) =>
    join("staff", schoolId),
  payroll: (schoolId: string, termId?: TermId) =>
    join("payroll", schoolId, termId),

  // ---- Communication ----
  inbox: (schoolId: string) =>
    join("inbox", schoolId),
  compose: (schoolId: string) =>
    join("compose", schoolId),
  templates: (schoolId: string) =>
    join("templates", schoolId),
  logs: (schoolId: string) =>
    join("logs", schoolId),
  marketplace: (schoolId: string) =>
    join("marketplace", schoolId),
  meetings: (schoolId: string) =>
    join("meetings", schoolId),

  // ---- Settings ----
  school: (schoolId: string) =>
    join("school", schoolId),
  users: (schoolId: string) =>
    join("users", schoolId),
  notifications: (schoolId: string) =>
    join("notifications", schoolId),
  billing: (schoolId: string) =>
    join("billing", schoolId),
  auditLog: (schoolId: string) =>
    join("audit-log", schoolId),
  api: (schoolId: string) =>
    join("api", schoolId),

  // ---- Analytics ----
  analytics: (schoolId: string) =>
    join("analytics", schoolId),
  analyticsReports: (schoolId: string) =>
    join("analytics-reports", schoolId),
  analyticsEmis: (schoolId: string) =>
    join("analytics-emis", schoolId),
} as const;

/**
 * Centralised invalidation helpers (Bug #5).
 *
 * Use these in `onSuccess` of mutations so the cascade is consistent
 * across the app: e.g. recording a fee payment should always invalidate
 * the student's account, the defaulters list, the fees index, and the
 * dashboard. Centralising means we never forget a downstream query.
 */
export const invalidate = {
  /** Recording / refunding a fee payment — balance, defaulters, index, dashboard. */
  feePaymentRecorded: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.feeAccounts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeDefaulters(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feesIndex(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feePayments(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeReceipts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeStatements(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Adding/updating/deleting an expense — P&L, dashboard. */
  expenseChanged: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.expenses(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feesIndex(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Enrolling a student — student count, accounts, dashboard. */
  studentEnrolled: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.students(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeAccounts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Promoting students — list, classes, accounts. */
  studentsPromoted: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.students(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.classes(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeAccounts(schoolId) });
  },
  /** Submitting attendance — overview, dashboard, class-list. */
  attendanceSubmitted: (qc: import("@tanstack/react-query").QueryClient, schoolId: string, classId?: string, date?: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.attendanceOverview(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.attendanceStudents(schoolId, classId) });
    if (classId && date) {
      qc.invalidateQueries({ queryKey: queryKeys.attendanceClassList(schoolId, classId, date) });
    }
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Recording marks — marks list, review, report cards. */
  marksRecorded: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.marks(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.marksReview(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.reportCards(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Fee structure change — affects all fee-related KPIs. */
  feeStructureChanged: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.feeStructures(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeAccounts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeDefaulters(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feesIndex(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Discount applied — fee accounts, defaulters, statements. */
  discountChanged: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.feeDiscounts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeAccounts(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feeDefaulters(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.feesIndex(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
  /** Staff / payroll change — staff list, payroll. */
  staffChanged: (qc: import("@tanstack/react-query").QueryClient, schoolId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.staff(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.payroll(schoolId) });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard(schoolId) });
  },
} as const;
