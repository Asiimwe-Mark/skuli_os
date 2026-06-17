/**
 * lib/typed-supabase-helpers.ts
 *
 * AP-3 fix: typed interfaces for common Supabase joined query shapes.
 * Replace all \`as any[]\` casts with these typed interfaces.
 * PostgREST join shapes are dynamic — the generated Database type
 * cannot infer nested select shapes, so we define them explicitly here.
 */
// Replace `as any[]` casts with these — they describe the actual shape that
// PostgREST returns for nested selects. TypeScript can't infer these from the
// generated Database type because PostgREST join shapes are dynamic.

// Fee payments with nested student + class + received_by user
export interface FeePaymentRow {
  id: string;
  fee_account_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  receipt_number: string | null;
  mobile_money_provider: string | null;
  mobile_money_number: string | null;
  pesapal_tx_id: string | null;
  notes: string | null;
  term_id: string | null;
  is_deleted: boolean;
  created_at: string;
  received_by_user_id: string | null;
  received_by: { full_name: string } | null;
  fee_account: {
    student: {
      full_name: string;
      admission_number: string;
      current_class: { name: string } | null;
    } | null;
    term: { name: string } | null;
  } | null;
}

// Fee accounts with nested student + class
export interface FeeAccountRow {
  id: string;
  student_id: string;
  school_id: string;
  term_id: string;
  total_fees: number;
  total_discount: number;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  is_deleted: boolean;
  student: {
    full_name: string;
    admission_number: string;
    parent_name: string | null;
    parent_phone: string | null;
    current_class: { id: string; name: string } | null;
  } | null;
  term: { name: string; start_date: string; end_date: string } | null;
}

// Student discounts with nested discount definition
export interface StudentDiscountRow {
  id: string;
  student_id: string;
  discount_id: string;
  term_id: string | null;
  is_deleted: boolean;
  discount: {
    id: string;
    name: string;
    discount_type: 'percentage' | 'fixed';
    value: number;
    is_deleted: boolean;
  } | null;
  student: {
    full_name: string;
    admission_number: string;
    current_class: { name: string } | null;
  } | null;
}

// Staff with nested payment profile
export interface StaffWithProfile {
  id: string;
  user_id: string;
  school_id: string;
  is_deleted: boolean;
  user: {
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    role: string;
    is_active: boolean;
  } | null;
  payment_profile: {
    id: string;
    payment_method: string;
    mobile_money_number: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
  } | null;
}

// Expense with nested category + user
export interface ExpenseRow {
  id: string;
  school_id: string;
  term_id: string | null;
  category_id: string;
  amount: number;
  description: string;
  expense_date: string;
  notes: string | null;
  receipt_number: string | null;
  recorded_by: string | null;
  is_deleted: boolean;
  created_at: string;
  category: { name: string; color: string | null } | null;
  recorded_by_user: { full_name: string } | null;
}

// Report card with nested student + class + term
export interface ReportCardRow {
  id: string;
  student_id: string;
  term_id: string;
  class_id: string;
  is_published: boolean;
  published_at: string | null;
  total_marks: number | null;
  average_mark: number | null;
  position: number | null;
  is_deleted: boolean;
  student: {
    full_name: string;
    admission_number: string;
    current_class: { name: string } | null;
  } | null;
  term: { name: string } | null;
  class: { name: string } | null;
}

// Recharts formatter fix — AP-10
// Use this instead of `formatter={... as any}`:
export type RechartsFormatter = (
  value: number | string,
  name?: string,
) => string | [string, string];