// ==================== Enums ====================
export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'BURSAR' | 'TEACHER' | 'PARENT' | 'GROUP_ADMIN';
export type SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'trial';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trial';
export type TermName = 'Term1' | 'Term2' | 'Term3';
export type StudentStatus = 'active' | 'left' | 'graduated';
export type PaymentMethod = 'mobile_money' | 'cash' | 'bank' | 'waiver';
export type MobileMoneyProvider = 'mtn' | 'airtel';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'reversed';
export type ExamType = 'bot' | 'midterm' | 'eot' | 'assignment' | 'practical';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type TargetAudience = 'all' | 'class' | 'defaulters' | 'custom';
export type SmsStatus = 'pending' | 'sent' | 'delivered' | 'failed';
export type PayrollPaymentStatus = 'pending' | 'paid';
export type FeeAccountStatus = 'current' | 'paid' | 'partial' | 'unpaid' | 'overpaid';
export type ConductGrade = 'A' | 'B' | 'C' | 'D';
export type SchoolType = 'primary' | 'secondary' | 'nursery' | 'both';
export type Gender = 'male' | 'female';

// ==================== Core Entities ====================
export interface School {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  motto: string | null;
  school_type: SchoolType;
  school_code: string;
  group_id: string | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  max_students: number;
  africas_talking_username: string | null;
  // Note: `africas_talking_api_key` was the plaintext column; it was
  // dropped in migration 00040 in favour of the encrypted
  // `africas_talking_api_key_enc`. The local School type dropped
  // the field; types/database.ts still has it because the
  // supabase-type generator was run before 00040 and hasn't been
  // regenerated. Use `africas_talking_api_key_enc` for any new code.
  cash_on: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface UserProfile {
  id: string;
  school_id: string | null;
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface AcademicYear {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface Term {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: TermName;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  stream: string | null;
  class_teacher_id: string | null;
  capacity: number | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined fields
  class_teacher?: UserProfile;
  student_count?: number;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  max_marks: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  created_at: string;
  // Joined
  subject?: Subject;
  teacher?: UserProfile;
  class?: Class;
}

export interface Student {
  id: string;
  school_id: string;
  admission_number: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  parent_nid: string | null;
  current_class_id: string | null;
  enrollment_date: string;
  status: StudentStatus;
  exit_date: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined
  current_class?: Class;
  fee_account?: FeeAccount;
}

export interface ClassEnrollment {
  id: string;
  student_id: string;
  class_id: string;
  term_id: string;
  academic_year_id: string;
  created_at: string;
}

export interface FeeStructure {
  id: string;
  school_id: string;
  term_id: string;
  class_id: string | null;
  name: string;
  amount: number;
  is_mandatory: boolean;
  frequency: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface FeeAccount {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  academic_year_id: string;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: FeeAccountStatus;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined
  student?: Student;
  term?: Term;
  current_class?: Class | null;
}

export interface FeePayment {
  id: string;
  school_id: string;
  fee_account_id: string;
  student_id: string;
  amount: number;
  payment_method: PaymentMethod;
  mobile_money_provider: MobileMoneyProvider | null;
  mobile_money_transaction_id: string | null;
  phone_used: string | null;
  received_by_user_id: string | null;
  payment_date: string;
  notes: string | null;
  receipt_number: string;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined
  student?: Student;
  received_by?: UserProfile;
  fee_account?: FeeAccount;
}

export type DiscountType = 'percentage' | 'fixed_amount';

export interface FeeDiscount {
  id: string;
  school_id: string;
  name: string;
  discount_type: DiscountType;
  value: number;
  max_amount: number | null;
  is_recurring: boolean;
  created_at: string;
  is_deleted: boolean;
}

export interface StudentDiscount {
  id: string;
  school_id: string;
  student_id: string;
  discount_id: string;
  term_id: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: string;
  is_deleted: boolean;
  // Joined fields
  discount?: FeeDiscount;
  student_name?: string;
  student_class?: string;
}

export interface Mark {
  id: string;
  school_id: string;
  student_id: string;
  subject_id: string;
  class_id: string;
  term_id: string;
  academic_year_id: string;
  exam_type: ExamType;
  score: number | null;
  max_score: number;
  entered_by: string | null;
  remarks: string | null;
  review_status: string;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined
  student?: Student;
  subject?: Subject;
}

export interface SubjectMarks {
  subject_id: string;
  subject_name: string;
  bot?: number;
  midterm?: number;
  eot?: number;
  assignment?: number;
  practical?: number;
  total: number;
  grade: string;
  remarks?: string;
}

export interface ReportCard {
  id: string;
  school_id: string;
  student_id: string;
  term_id: string;
  academic_year_id: string;
  total_marks: number | null;
  average: number | null;
  position_in_class: number | null;
  class_size: number | null;
  class_teacher_comment: string | null;
  headmaster_comment: string | null;
  conduct_grade: ConductGrade | null;
  is_published: boolean;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  student?: Student;
  term?: Term;
}

export interface AttendanceRecord {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: string | null;
  notes: string | null;
  remarks: string | null;
  created_at: string;
  // Joined
  student?: Student;
}

export interface Announcement {
  id: string;
  school_id: string;
  title: string;
  body: string | null;
  target_audience: TargetAudience;
  target_class_ids: string[];
  sent_via: string;
  scheduled_at: string | null;
  scheduled_status: string;
  sent_at: string | null;
  sent_by: string | null;
  sms_cost: number | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface SmsLog {
  id: string;
  school_id: string;
  recipient_phone: string;
  message_body: string;
  message_type: string | null;
  status: SmsStatus;
  africa_talking_message_id: string | null;
  cost: number | null;
  sent_at: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

export interface Staff {
  id: string;
  school_id: string;
  user_id: string | null;
  employee_number: string;
  full_name: string;
  role_title: string | null;
  photo_url: string | null;
  national_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  nssf_number: string | null;
  basic_salary: number | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface MeetingSlot {
  id: string;
  school_id: string;
  teacher_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_booked: boolean;
  is_deleted: boolean;
  // Joined
  teacher?: Staff;
  booking?: MeetingBooking;
}

export interface MeetingBooking {
  id: string;
  slot_id: string;
  school_id: string;
  student_id: string;
  parent_name: string;
  parent_phone: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  reminder_sent: boolean;
  created_at: string;
  // Joined
  slot?: MeetingSlot;
  student?: Student;
}

export interface ThreadWithPreview {
  id: string;
  school_id: string;
  parent_phone: string;
  student_id: string | null;
  last_message_at: string;
  is_read: boolean;
  is_deleted: boolean;
  // Joined
  student?: { full_name: string; admission_number: string | null } | null;
  last_message?: { body: string; direction: string } | null;
}

export interface PayrollRecord {
  id: string;
  school_id: string;
  staff_id: string;
  month: number;
  year: number;
  basic_salary: number;
  gross_salary: number;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  nssf_employee: number;
  nssf_employer: number;
  net_salary: number;
  payment_status: PayrollPaymentStatus;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  // Joined
  staff?: Staff;
}

export interface SubscriptionInvoice {
  id: string;
  school_id: string;
  pesapal_tx_id: string | null;
  plan: SubscriptionPlan;
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  school_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ==================== Dashboard Types ====================
export interface DashboardKPIs {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
}

export interface QuickAction {
  label: string;
  href: string;
  icon: string;
  color: string;
}

// ==================== Form Types ====================
export interface OnboardingData {
  schoolName: string;
  address: string;
  district: string;
  phone: string;
  email: string;
  schoolType: SchoolType;
  logoUrl: string | null;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  plan: SubscriptionPlan;
}

export interface PaymentFormData {
  studentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  mobileMoneyProvider?: MobileMoneyProvider;
  phoneUsed?: string;
  transactionId?: string;
  paymentDate: string;
  notes?: string;
}

export interface MarksEntryData {
  studentId: string;
  subjectId: string;
  classId: string;
  termId: string;
  examType: ExamType;
  score: number;
  maxScore: number;
  remarks?: string;
}
