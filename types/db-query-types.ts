/**
 * db-query-types.ts
 *
 * Strongly-typed shapes for Supabase join query results throughout Skuli OS.
 *
 * WHY THIS FILE EXISTS:
 * Supabase's PostgREST JS client infers column types from the generated
 * database.ts, but it does NOT automatically type nested join results
 * (e.g. `.select("*, students(full_name)")`). TypeScript sees the join
 * result as `unknown`, forcing developers to write `as unknown as { ... }`
 * everywhere — hiding real bugs and making refactoring unsafe.
 *
 * This file defines explicit, named types for every join shape used across
 * the app. Import these instead of using inline casts.
 *
 * USAGE:
 *   import type { StudentWithClass, FeePaymentWithJoins } from '@/types/db-query-types';
 *
 * MAINTENANCE:
 *   When you add a new `.select()` query with joins, add its return type here.
 *   When a column is added/removed from a table, update the relevant types.
 */

import type { Tables } from '@/types/database';

// ─── Base table row aliases ───────────────────────────────────────────────────

export type StudentRow          = Tables<'students'>;
export type ClassRow            = Tables<'classes'>;
export type StaffRow            = Tables<'staff'>;
export type UserRow             = Tables<'users'>;
export type SchoolRow           = Tables<'schools'>;
export type TermRow             = Tables<'terms'>;
export type AcademicYearRow     = Tables<'academic_years'>;
export type FeeAccountRow       = Tables<'fee_accounts'>;
export type FeePaymentRow       = Tables<'fee_payments'>;
export type FeeStructureRow     = Tables<'fee_structures'>;
export type FeeDiscountRow      = Tables<'fee_discounts'>;
export type SubjectRow          = Tables<'subjects'>;
export type MarkRow             = Tables<'marks'>;
export type AttendanceRow       = Tables<'attendance_records'>;
export type ReportCardRow       = Tables<'report_cards'>;
export type PayrollRecordRow    = Tables<'payroll_records'>;
export type BatchLineItemRow    = Tables<'batch_line_items'>;
export type PayrollBatchRow     = Tables<'payroll_batches'>;
export type NotificationLogRow  = Tables<'notification_logs'>;
export type TuitionPaymentRow   = Tables<'tuition_payments'>;
export type ClassEnrollmentRow  = Tables<'class_enrollments'>;
export type ClassSubjectRow     = Tables<'class_subjects'>;

// ─── Students ─────────────────────────────────────────────────────────────────

export interface StudentWithClass extends StudentRow {
  classes: Pick<ClassRow, 'id' | 'name' | 'stream'> | null;
}

export interface StudentWithClassAndFeeAccount extends StudentWithClass {
  fee_accounts: Pick<FeeAccountRow, 'id' | 'balance' | 'total_paid' | 'total_expected' | 'status'> | null;
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export interface ClassWithTeacher extends ClassRow {
  class_teacher: Pick<UserRow, 'id' | 'full_name' | 'email'> | null;
}

export interface ClassWithEnrollmentCount extends ClassRow {
  class_enrollments: { count: number }[];
}

// ─── Fee Payments ─────────────────────────────────────────────────────────────

export interface FeePaymentWithJoins extends FeePaymentRow {
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> | null;
  terms: Pick<TermRow, 'id' | 'name'> | null;
  received_by: Pick<UserRow, 'id' | 'full_name'> | null;
}

// ─── Fee Accounts ─────────────────────────────────────────────────────────────

export interface FeeAccountWithStudent extends FeeAccountRow {
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number' | 'parent_phone' | 'parent_name'> | null;
}

export interface FeeAccountWithStudentAndTerm extends FeeAccountWithStudent {
  terms: (Pick<TermRow, 'id' | 'name'> & {
    academic_years: Pick<AcademicYearRow, 'id' | 'name'> | null;
  }) | null;
}

// ─── Marks / Report Cards ─────────────────────────────────────────────────────

export interface MarkWithSubject extends MarkRow {
  subjects: Pick<SubjectRow, 'id' | 'name' | 'code' | 'max_marks'> | null;
}

export interface MarkReviewRow extends MarkRow {
  classes: Pick<ClassRow, 'id' | 'name'> | null;
  subjects: Pick<SubjectRow, 'id' | 'name'> | null;
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> | null;
  entered_by_user: Pick<UserRow, 'id' | 'full_name'> | null;
}

export interface ReportCardWithStudent extends ReportCardRow {
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> | null;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceWithStudent extends AttendanceRow {
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> | null;
}

export interface ClassEnrollmentWithStudent extends ClassEnrollmentRow {
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number' | 'gender' | 'parent_phone'> | null;
}

// ─── Staff / Payroll ──────────────────────────────────────────────────────────

export interface StaffWithUser extends StaffRow {
  users: Pick<UserRow, 'id' | 'full_name' | 'email' | 'phone' | 'role' | 'role_title' | 'avatar_url' | 'is_active'> | null;
}

export interface PayrollRecordWithStaff extends PayrollRecordRow {
  staff: Pick<StaffRow, 'id' | 'full_name' | 'employee_number' | 'role_title'> | null;
}

// ─── Timetable ────────────────────────────────────────────────────────────────

export interface TimetableSlotWithJoins {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  period_id: string;
  day_of_week: number;
  room: string | null;
  academic_year_id: string;
  classes: Pick<ClassRow, 'id' | 'name'> | null;
  subjects: Pick<SubjectRow, 'id' | 'name' | 'color'> | null;
  teacher: Pick<UserRow, 'id' | 'full_name'> | null;
  periods: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    is_break: boolean;
    sort_order: number;
  } | null;
}

// ─── Communication ────────────────────────────────────────────────────────────

export interface AnnouncementWithSender {
  id: string;
  school_id: string;
  title: string;
  body: string;
  target_audience: string;
  target_class_ids: string[] | null;
  sent_via: string | null;
  sent_at: string | null;
  scheduled_at: string | null;
  scheduled_status: string | null;
  sms_cost: number | null;
  created_at: string;
  sent_by_user: Pick<UserRow, 'id' | 'full_name'> | null;
}

// ─── Discipline ───────────────────────────────────────────────────────────────

export interface DisciplineWithStudent {
  id: string;
  school_id: string;
  student_id: string;
  incident_date: string;
  incident_type: string;
  description: string | null;
  action_taken: string | null;
  parent_notified: boolean;
  parent_notified_at: string | null;
  recorded_by: string | null;
  created_at: string;
  student: Pick<StudentRow, 'id' | 'full_name' | 'admission_number' | 'parent_name' | 'parent_phone'> | null;
  school: Pick<SchoolRow, 'id' | 'name'> | null;
}

// ─── Receipt / Payment verification ──────────────────────────────────────────

export interface FeePaymentForReceipt extends FeePaymentRow {
  students: (Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> & {
    current_class: Pick<ClassRow, 'name'> | null;
  }) | null;
  schools: Pick<SchoolRow, 'id' | 'name' | 'address' | 'phone' | 'logo_url'> | null;
  received_by: Pick<UserRow, 'id' | 'full_name'> | null;
}

// ─── Portal ───────────────────────────────────────────────────────────────────

export interface PortalFeeAccount extends FeeAccountRow {
  terms: (Pick<TermRow, 'id' | 'name' | 'start_date' | 'end_date'> & {
    academic_years: Pick<AcademicYearRow, 'id' | 'name'> | null;
  }) | null;
  fee_structures: Pick<FeeStructureRow, 'id' | 'name' | 'amount' | 'frequency'>[] | null;
  student_discounts: {
    id: string;
    fee_discounts: Pick<FeeDiscountRow, 'id' | 'name' | 'discount_type' | 'value' | 'description'> | null;
  }[] | null;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface SchoolForRevenue extends Pick<SchoolRow,
  'id' | 'name' | 'subscription_plan' | 'subscription_status' | 'created_at' | 'next_billing_date'
> {}

export interface ConciergeLeadWithAssignee {
  id: string;
  school_name: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  district: string | null;
  student_count: number | null;
  current_system: string | null;
  status: string;
  notes: string | null;
  internal_notes: string | null;
  preferred_date: string | null;
  followed_up_at: string | null;
  created_at: string;
  assigned_to_user: Pick<UserRow, 'id' | 'full_name'> | null;
}

// ─── Referrals ────────────────────────────────────────────────────────────────

export interface ReferralWithSchool {
  id: string;
  created_at: string;
  credit_months: number;
  rewarded_at: string | null;
  referral_code_id: string;
  referred_school_id: string;
  schools: Pick<SchoolRow, 'id' | 'name'> | null;
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

export interface MeetingSlotWithTeacher {
  id: string;
  school_id: string;
  teacher_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_booked: boolean;
  is_deleted: boolean;
  teacher: Pick<UserRow, 'id' | 'full_name'> | null;
}

// ─── Library ──────────────────────────────────────────────────────────────────

export interface LibraryIssueWithBook {
  id: string;
  school_id: string;
  book_id: string;
  student_id: string;
  issued_at: string;
  due_date: string;
  returned_at: string | null;
  fine_amount: number;
  fine_paid: boolean;
  issued_by: string | null;
  library_books: Pick<Tables<'library_books'>, 'id' | 'title' | 'author' | 'isbn'> | null;
  students: Pick<StudentRow, 'id' | 'full_name' | 'admission_number'> | null;
}

// ─── Group admin ──────────────────────────────────────────────────────────────

export interface GroupAdminWithUser {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
  user: Pick<UserRow, 'id' | 'full_name' | 'phone'> | null;
}