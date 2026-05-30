-- ============================================
-- Migration: 00001_create_enums.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: Enum Types
-- Migration 00001
-- =============================================================================

CREATE TYPE user_role AS ENUM (
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'BURSAR',
    'TEACHER',
    'PARENT'
);

CREATE TYPE subscription_plan AS ENUM (
    'starter',
    'growth',
    'pro'
);

CREATE TYPE subscription_status AS ENUM (
    'active',
    'past_due',
    'cancelled',
    'trial'
);

CREATE TYPE student_status AS ENUM (
    'active',
    'left',
    'graduated'
);

CREATE TYPE term_name AS ENUM (
    'Term1',
    'Term2',
    'Term3'
);

CREATE TYPE payment_method AS ENUM (
    'mobile_money',
    'cash',
    'bank',
    'waiver'
);

CREATE TYPE mm_provider AS ENUM (
    'mtn',
    'airtel'
);

CREATE TYPE payment_status AS ENUM (
    'pending',
    'confirmed',
    'failed',
    'reversed'
);

CREATE TYPE exam_type AS ENUM (
    'bot',
    'midterm',
    'eot',
    'assignment',
    'practical'
);

CREATE TYPE attendance_status AS ENUM (
    'present',
    'absent',
    'late',
    'excused'
);

CREATE TYPE announcement_target AS ENUM (
    'all',
    'class',
    'defaulters',
    'custom'
);

CREATE TYPE sms_channel AS ENUM (
    'sms',
    'email',
    'in_app'
);

CREATE TYPE sms_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'failed'
);

CREATE TYPE payroll_payment_status AS ENUM (
    'pending',
    'paid'
);

CREATE TYPE conduct_grade AS ENUM (
    'A',
    'B',
    'C',
    'D'
);

CREATE TYPE fee_account_status AS ENUM (
    'paid',
    'partial',
    'unpaid',
    'overpaid'
);

CREATE TYPE report_card_status AS ENUM (
    'not_started',
    'draft',
    'submitted',
    'approved'
);

CREATE TYPE school_type AS ENUM (
    'primary',
    'secondary',
    'both'
);

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');


-- ============================================
-- Migration: 00002_create_tables.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: All Tables
-- Migration 00002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. schools
-- ---------------------------------------------------------------------------
CREATE TABLE schools (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    logo_url        text,
    address         text,
    district        text,
    phone           text,
    email           text,
    motto           text,
    school_code     text UNIQUE,
    school_type     school_type NOT NULL DEFAULT 'primary',
    subscription_plan    text NOT NULL DEFAULT 'trial',
    subscription_status  text NOT NULL DEFAULT 'trial',
    trial_ends_at   timestamptz,
    max_students    int NOT NULL DEFAULT 100,
    africas_talking_username text,
    africas_talking_api_key  text,
    sms_sender_id   text NOT NULL DEFAULT 'SKULI',
    stripe_customer_id text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
    role        user_role NOT NULL DEFAULT 'SCHOOL_ADMIN',
    full_name   text NOT NULL,
    phone       text,
    avatar_url  text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. academic_years
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    is_current  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 4. terms
-- ---------------------------------------------------------------------------
CREATE TABLE terms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name            term_name NOT NULL,
    start_date      date,
    end_date        date,
    is_current      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 5. classes
-- ---------------------------------------------------------------------------
CREATE TABLE classes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    level           text,
    stream          text,
    class_teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 6. subjects
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    code        text,
    max_marks   int NOT NULL DEFAULT 100,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 7. class_subjects
-- ---------------------------------------------------------------------------
CREATE TABLE class_subjects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id  uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false,
    UNIQUE (class_id, subject_id)
);

-- ---------------------------------------------------------------------------
-- 8. students
-- ---------------------------------------------------------------------------
CREATE TABLE students (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    admission_number text NOT NULL,
    full_name       text NOT NULL,
    date_of_birth   date,
    gender          text,
    photo_url       text,
    parent_name     text,
    parent_phone    text,
    parent_email    text,
    parent_nid      text,
    current_class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
    enrollment_date date,
    status          student_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, admission_number)
);

-- ---------------------------------------------------------------------------
-- 9. class_enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE class_enrollments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, term_id)
);

-- ---------------------------------------------------------------------------
-- 10. fee_structures
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structures (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    term_id     uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
    name        text NOT NULL,
    amount      numeric NOT NULL,
    is_mandatory boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 11. fee_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE fee_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    total_expected  numeric NOT NULL DEFAULT 0,
    total_paid      numeric NOT NULL DEFAULT 0,
    balance         numeric NOT NULL DEFAULT 0,
    status          fee_account_status NOT NULL DEFAULT 'unpaid',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, term_id)
);

-- ---------------------------------------------------------------------------
-- 12. fee_payments
-- ---------------------------------------------------------------------------
CREATE TABLE fee_payments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id               uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_account_id          uuid NOT NULL REFERENCES fee_accounts(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount                  numeric NOT NULL,
    payment_method          payment_method NOT NULL,
    mobile_money_provider   mm_provider,
    mobile_money_transaction_id text,
    phone_used              text,
    received_by_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    payment_date            date NOT NULL DEFAULT current_date,
    notes                   text,
    receipt_number          text,
    status                  payment_status NOT NULL DEFAULT 'pending',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    is_deleted              boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 13. marks
-- ---------------------------------------------------------------------------
CREATE TABLE marks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id      uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    exam_type       exam_type NOT NULL,
    score           numeric,
    max_score       numeric NOT NULL DEFAULT 100,
    entered_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    remarks         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, subject_id, term_id, exam_type)
);

-- ---------------------------------------------------------------------------
-- 14. report_cards
-- ---------------------------------------------------------------------------
CREATE TABLE report_cards (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id             uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    total_marks         numeric,
    average             numeric,
    position_in_class   int,
    class_size          int,
    class_teacher_comment text,
    headmaster_comment  text,
    conduct_grade       conduct_grade,
    is_published        boolean NOT NULL DEFAULT false,
    pdf_url             text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    is_deleted          boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 15. attendance_records
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_records (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date        date NOT NULL,
    status      attendance_status NOT NULL,
    marked_by   uuid REFERENCES users(id) ON DELETE SET NULL,
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, class_id, date)
);

-- ---------------------------------------------------------------------------
-- 16. announcements
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title               text NOT NULL,
    body                text,
    target_audience     announcement_target NOT NULL,
    target_class_ids    uuid[],
    sent_via            sms_channel NOT NULL,
    scheduled_at        timestamptz,
    sent_at             timestamptz,
    sent_by             uuid REFERENCES users(id) ON DELETE SET NULL,
    sms_cost            numeric,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    is_deleted          boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 17. sms_logs
-- ---------------------------------------------------------------------------
CREATE TABLE sms_logs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id               uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_phone         text NOT NULL,
    message_body            text,
    message_type            text,
    status                  sms_status NOT NULL DEFAULT 'pending',
    africa_talking_message_id text,
    cost                    numeric,
    sent_at                 timestamptz,
    related_entity_type     text,
    related_entity_id       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    is_deleted              boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 18. staff
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    employee_number text NOT NULL,
    full_name       text NOT NULL,
    role_title      text,
    national_id     text,
    bank_name       text,
    bank_account    text,
    nssf_number     text,
    basic_salary    numeric,
    hire_date       date,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, employee_number)
);

-- ---------------------------------------------------------------------------
-- 19. payroll_records
-- ---------------------------------------------------------------------------
CREATE TABLE payroll_records (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    month           int NOT NULL,
    year            int NOT NULL,
    basic_salary    numeric NOT NULL,
    allowances      jsonb NOT NULL DEFAULT '{}',
    deductions      jsonb NOT NULL DEFAULT '{}',
    nssf_employee   numeric,
    nssf_employer   numeric,
    net_salary      numeric,
    payment_status  payroll_payment_status NOT NULL DEFAULT 'pending',
    paid_at         timestamptz,
    payment_method  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 20. subscription_invoices
-- ---------------------------------------------------------------------------
CREATE TABLE subscription_invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    flutterwave_tx_id text,
    plan            subscription_plan NOT NULL,
    amount          numeric NOT NULL,
    currency        text NOT NULL DEFAULT 'UGX',
    period_start    timestamptz,
    period_end      timestamptz,
    status          text,
    paid_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 21. audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
    user_id     uuid,
    action      text NOT NULL,
    entity_type text,
    entity_id   uuid,
    old_value   jsonb,
    new_value   jsonb,
    ip_address  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);


-- ============================================
-- Migration: 00003_create_indexes.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: Performance Indexes
-- Migration 00003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- school_id indexes (every table with school_id)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_academic_years_school_id ON academic_years(school_id);
CREATE INDEX idx_terms_school_id ON terms(school_id);
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_subjects_school_id ON subjects(school_id);
CREATE INDEX idx_class_subjects_school_id ON class_subjects(class_id);
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_class_enrollments_school_id ON class_enrollments(class_id);
CREATE INDEX idx_fee_structures_school_id ON fee_structures(school_id);
CREATE INDEX idx_fee_accounts_school_id ON fee_accounts(school_id);
CREATE INDEX idx_fee_payments_school_id ON fee_payments(school_id);
CREATE INDEX idx_marks_school_id ON marks(school_id);
CREATE INDEX idx_report_cards_school_id ON report_cards(school_id);
CREATE INDEX idx_attendance_records_school_id ON attendance_records(school_id);
CREATE INDEX idx_announcements_school_id ON announcements(school_id);
CREATE INDEX idx_sms_logs_school_id ON sms_logs(school_id);
CREATE INDEX idx_staff_school_id ON staff(school_id);
CREATE INDEX idx_payroll_records_school_id ON payroll_records(school_id);
CREATE INDEX idx_subscription_invoices_school_id ON subscription_invoices(school_id);
CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);

-- ---------------------------------------------------------------------------
-- student_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX idx_fee_accounts_student_id ON fee_accounts(student_id);
CREATE INDEX idx_fee_payments_student_id ON fee_payments(student_id);
CREATE INDEX idx_marks_student_id ON marks(student_id);
CREATE INDEX idx_report_cards_student_id ON report_cards(student_id);
CREATE INDEX idx_attendance_records_student_id ON attendance_records(student_id);

-- ---------------------------------------------------------------------------
-- term_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_terms_academic_year_id ON terms(academic_year_id);
CREATE INDEX idx_class_enrollments_term_id ON class_enrollments(term_id);
CREATE INDEX idx_fee_structures_term_id ON fee_structures(term_id);
CREATE INDEX idx_fee_accounts_term_id ON fee_accounts(term_id);
CREATE INDEX idx_marks_term_id ON marks(term_id);
CREATE INDEX idx_report_cards_term_id ON report_cards(term_id);

-- ---------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_classes_class_teacher_id ON classes(class_teacher_id);
CREATE INDEX idx_class_subjects_teacher_id ON class_subjects(teacher_id);
CREATE INDEX idx_class_subjects_subject_id ON class_subjects(subject_id);
CREATE INDEX idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX idx_class_enrollments_academic_year_id ON class_enrollments(academic_year_id);
CREATE INDEX idx_fee_structures_class_id ON fee_structures(class_id);
CREATE INDEX idx_fee_accounts_academic_year_id ON fee_accounts(academic_year_id);
CREATE INDEX idx_fee_payments_fee_account_id ON fee_payments(fee_account_id);
CREATE INDEX idx_fee_payments_received_by ON fee_payments(received_by_user_id);
CREATE INDEX idx_marks_subject_id ON marks(subject_id);
CREATE INDEX idx_marks_class_id ON marks(class_id);
CREATE INDEX idx_marks_academic_year_id ON marks(academic_year_id);
CREATE INDEX idx_marks_entered_by ON marks(entered_by);
CREATE INDEX idx_report_cards_academic_year_id ON report_cards(academic_year_id);
CREATE INDEX idx_attendance_records_class_id ON attendance_records(class_id);
CREATE INDEX idx_attendance_records_marked_by ON attendance_records(marked_by);
CREATE INDEX idx_announcements_sent_by ON announcements(sent_by);
CREATE INDEX idx_staff_user_id ON staff(user_id);
CREATE INDEX idx_payroll_records_staff_id ON payroll_records(staff_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- ---------------------------------------------------------------------------
-- Query-specific indexes
-- ---------------------------------------------------------------------------
-- Students
CREATE INDEX idx_students_admission_number ON students(admission_number);
CREATE INDEX idx_students_current_class_id ON students(current_class_id);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_parent_phone ON students(parent_phone);

-- Fee payments
CREATE INDEX idx_fee_payments_payment_date ON fee_payments(payment_date);
CREATE INDEX idx_fee_payments_receipt_number ON fee_payments(receipt_number);
CREATE INDEX idx_fee_payments_status ON fee_payments(status);

-- Fee accounts
CREATE INDEX idx_fee_accounts_status ON fee_accounts(status);

-- Attendance
CREATE INDEX idx_attendance_records_date ON attendance_records(date);
CREATE INDEX idx_attendance_records_status ON attendance_records(status);

-- Marks
CREATE INDEX idx_marks_exam_type ON marks(exam_type);

-- SMS logs
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_sent_at ON sms_logs(sent_at);

-- Announcements
CREATE INDEX idx_announcements_target_audience ON announcements(target_audience);
CREATE INDEX idx_announcements_sent_at ON announcements(sent_at);

-- Staff
CREATE INDEX idx_staff_is_active ON staff(is_active);

-- Payroll
CREATE INDEX idx_payroll_records_month_year ON payroll_records(month, year);
CREATE INDEX idx_payroll_records_payment_status ON payroll_records(payment_status);

-- Subscription invoices
CREATE INDEX idx_subscription_invoices_plan ON subscription_invoices(plan);
CREATE INDEX idx_subscription_invoices_status ON subscription_invoices(status);

-- Audit logs
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Academic structure
CREATE INDEX idx_academic_years_is_current ON academic_years(is_current);
CREATE INDEX idx_terms_is_current ON terms(is_current);


-- ============================================
-- Migration: 00004_create_rls.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: Row Level Security
-- Migration 00004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Returns the school_id for the current authenticated user
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT school_id FROM users WHERE id = auth.uid();
$$;

-- Returns the role for the current authenticated user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM users WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- ---------------------------------------------------------------------------
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- SCHOOLS
-- ===========================================================================

-- SUPER_ADMIN sees all schools
CREATE POLICY "super_admin_all_schools"
    ON schools FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School staff see their own school
CREATE POLICY "school_members_own_school"
    ON schools FOR SELECT
    USING (
        id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- School admins can update their own school
CREATE POLICY "school_admin_update_own_school"
    ON schools FOR UPDATE
    USING (
        id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- USERS
-- ===========================================================================

-- SUPER_ADMIN sees all users
CREATE POLICY "super_admin_all_users"
    ON users FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School members can see users in their school
CREATE POLICY "school_members_see_school_users"
    ON users FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- Users can see their own record
CREATE POLICY "users_see_own_record"
    ON users FOR SELECT
    USING (id = auth.uid());

-- School admins can manage users in their school
CREATE POLICY "school_admin_manage_users"
    ON users FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- ACADEMIC YEARS
-- ===========================================================================

CREATE POLICY "super_admin_all_academic_years"
    ON academic_years FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_academic_years"
    ON academic_years FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- TERMS
-- ===========================================================================

CREATE POLICY "super_admin_all_terms"
    ON terms FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_terms"
    ON terms FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- CLASSES
-- ===========================================================================

CREATE POLICY "super_admin_all_classes"
    ON classes FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_classes"
    ON classes FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see classes where they are class_teacher or assigned via class_subjects
CREATE POLICY "teacher_assigned_classes"
    ON classes FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_teacher_id = auth.uid()
            OR id IN (
                SELECT class_id FROM class_subjects
                WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- ===========================================================================
-- SUBJECTS
-- ===========================================================================

CREATE POLICY "super_admin_all_subjects"
    ON subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_subjects"
    ON subjects FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- CLASS SUBJECTS
-- ===========================================================================

CREATE POLICY "super_admin_all_class_subjects"
    ON class_subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_class_subjects"
    ON class_subjects FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_id
            AND c.school_id = get_user_school_id()
        )
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see their assigned class_subjects
CREATE POLICY "teacher_see_own_class_subjects"
    ON class_subjects FOR SELECT
    USING (
        teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_id
            AND c.school_id = get_user_school_id()
        )
    );

-- ===========================================================================
-- STUDENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_students"
    ON students FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School admins and bursars see all students in their school
CREATE POLICY "school_admin_bursar_all_students"
    ON students FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see students in their assigned classes
CREATE POLICY "teacher_assigned_students"
    ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR current_class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see only their own children (matched by phone)
CREATE POLICY "parent_own_children"
    ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
    );

-- ===========================================================================
-- CLASS ENROLLMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_class_enrollments"
    ON class_enrollments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_enrollments"
    ON class_enrollments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = student_id
            AND s.school_id = get_user_school_id()
        )
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

CREATE POLICY "teacher_see_enrollments"
    ON class_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = student_id
            AND s.school_id = get_user_school_id()
        )
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

CREATE POLICY "parent_see_enrollments"
    ON class_enrollments FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
        AND get_user_role() = 'PARENT'
    );

-- ===========================================================================
-- FEE STRUCTURES
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_structures"
    ON fee_structures FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_fee_structures"
    ON fee_structures FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers can read fee structures
CREATE POLICY "teacher_read_fee_structures"
    ON fee_structures FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
    );

-- ===========================================================================
-- FEE ACCOUNTS
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_accounts"
    ON fee_accounts FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- Bursar has full fee access
CREATE POLICY "school_admin_bursar_fee_accounts"
    ON fee_accounts FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers: read-only for their assigned students
CREATE POLICY "teacher_read_fee_accounts"
    ON fee_accounts FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR current_class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
            AND is_deleted = false
        )
    );

-- Parents see fee accounts for their own children
CREATE POLICY "parent_own_fee_accounts"
    ON fee_accounts FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- FEE PAYMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_payments"
    ON fee_payments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- Bursar has full fee access
CREATE POLICY "school_admin_bursar_fee_payments"
    ON fee_payments FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Parents see payments for their own children
CREATE POLICY "parent_own_fee_payments"
    ON fee_payments FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- MARKS
-- ===========================================================================

CREATE POLICY "super_admin_all_marks"
    ON marks FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_marks"
    ON marks FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage marks for their assigned subjects/classes
CREATE POLICY "teacher_manage_marks"
    ON marks FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR (class_id, subject_id) IN (
                SELECT class_id, subject_id FROM class_subjects
                WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see marks for their own children
CREATE POLICY "parent_own_marks"
    ON marks FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- REPORT CARDS
-- ===========================================================================

CREATE POLICY "super_admin_all_report_cards"
    ON report_cards FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_report_cards"
    ON report_cards FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage report cards for their assigned classes
CREATE POLICY "teacher_manage_report_cards"
    ON report_cards FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            AND is_deleted = false
        )
    );

-- Parents see published report cards for their own children
CREATE POLICY "parent_own_report_cards"
    ON report_cards FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND is_published = true
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- ATTENDANCE RECORDS
-- ===========================================================================

CREATE POLICY "super_admin_all_attendance"
    ON attendance_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_attendance"
    ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage attendance for their assigned classes
CREATE POLICY "teacher_manage_attendance"
    ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see attendance for their own children
CREATE POLICY "parent_own_attendance"
    ON attendance_records FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- ANNOUNCEMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_announcements"
    ON announcements FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_announcements"
    ON announcements FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see announcements targeted to them
CREATE POLICY "teacher_see_announcements"
    ON announcements FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
    );

-- Parents see announcements targeted to all or their children's class
CREATE POLICY "parent_see_announcements"
    ON announcements FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND (
            target_audience = 'all'
            OR target_class_ids && (
                SELECT array_agg(s.current_class_id) FROM students s
                WHERE s.parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
                AND s.school_id = get_user_school_id()
                AND s.is_deleted = false
            )
        )
    );

-- ===========================================================================
-- SMS LOGS
-- ===========================================================================

CREATE POLICY "super_admin_all_sms_logs"
    ON sms_logs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_sms_logs"
    ON sms_logs FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- ===========================================================================
-- STAFF
-- ===========================================================================

CREATE POLICY "super_admin_all_staff"
    ON staff FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_staff"
    ON staff FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Staff can see their own record
CREATE POLICY "staff_see_own_record"
    ON staff FOR SELECT
    USING (
        user_id = auth.uid()
        AND school_id = get_user_school_id()
    );

-- ===========================================================================
-- PAYROLL RECORDS
-- ===========================================================================

CREATE POLICY "super_admin_all_payroll"
    ON payroll_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_payroll"
    ON payroll_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- ===========================================================================
-- SUBSCRIPTION INVOICES
-- ===========================================================================

CREATE POLICY "super_admin_all_subscription_invoices"
    ON subscription_invoices FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_subscription_invoices"
    ON subscription_invoices FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- AUDIT LOGS
-- ===========================================================================

CREATE POLICY "super_admin_all_audit_logs"
    ON audit_logs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_audit_logs"
    ON audit_logs FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- System can insert audit logs (used by triggers/functions)
CREATE POLICY "system_insert_audit_logs"
    ON audit_logs FOR INSERT
    WITH CHECK (true);


-- ============================================
-- Migration: 00005_create_functions.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: Database Functions & Triggers
-- Migration 00005
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. update_updated_at() - Auto-update updated_at on every table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON terms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_structures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON marks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sms_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payroll_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. recalculate_fee_account(account_id)
--    Recalculates total_expected, total_paid, balance, status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account fee_accounts%ROWTYPE;
    v_total_expected numeric;
    v_total_paid numeric;
    v_balance numeric;
    v_status fee_account_status;
BEGIN
    -- Fetch the account
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- Calculate total_expected from fee_structures for this term/class
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_total_expected
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id = v_account.term_id
      AND fs.school_id = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- Calculate total_paid from confirmed fee_payments
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status = 'confirmed'
      AND fp.is_deleted = false;

    -- Calculate balance
    v_balance := v_total_expected - v_total_paid;

    -- Determine status
    IF v_balance = 0 AND v_total_expected > 0 THEN
        v_status := 'paid';
    ELSIF v_balance > 0 AND v_total_paid > 0 THEN
        v_status := 'partial';
    ELSIF v_balance < 0 THEN
        v_status := 'overpaid';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- Update the account
    UPDATE fee_accounts
    SET total_expected = v_total_expected,
        total_paid = v_total_paid,
        balance = v_balance,
        status = v_status
    WHERE id = p_account_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. generate_receipt_number(p_school_id)
--    Generates SKULI-{CODE}-{YYYYMM}-{SEQ} format
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_receipt_number(p_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_school_code text;
    v_year_month text;
    v_seq int;
    v_receipt text;
BEGIN
    -- Get school code
    SELECT school_code INTO v_school_code
    FROM schools
    WHERE id = p_school_id;

    IF v_school_code IS NULL THEN
        v_school_code := 'UNK';
    END IF;

    -- Get current year-month
    v_year_month := to_char(now(), 'YYYYMM');

    -- Get next sequence number for this school/month
    SELECT COALESCE(
        MAX(
            CAST(
                SPLIT_PART(receipt_number, '-', 4) AS int
            )
        ), 0
    ) + 1
    INTO v_seq
    FROM fee_payments
    WHERE school_id = p_school_id
      AND receipt_number LIKE 'SKULI-' || v_school_code || '-' || v_year_month || '-%'
      AND is_deleted = false;

    -- Build receipt number
    v_receipt := 'SKULI-' || v_school_code || '-' || v_year_month || '-' || LPAD(v_seq::text, 4, '0');

    RETURN v_receipt;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user()
--    Trigger on auth.users insert to create users table record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_full_name text;
    v_phone text;
    v_role user_role;
    v_school_id uuid;
BEGIN
    -- Extract metadata set during signup
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    v_phone := COALESCE(
        NEW.raw_user_meta_data->>'phone',
        NEW.phone
    );

    v_role := COALESCE(
        (NEW.raw_user_meta_data->>'role')::user_role,
        'SCHOOL_ADMIN'
    );

    v_school_id := (NEW.raw_user_meta_data->>'school_id')::uuid;

    INSERT INTO users (
        id,
        school_id,
        role,
        full_name,
        phone,
        is_active
    ) VALUES (
        NEW.id,
        v_school_id,
        v_role,
        v_full_name,
        v_phone,
        true
    );

    RETURN NEW;
END;
$$;

-- Trigger to auto-create user profile on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. create_fee_accounts_for_term(p_school_id, p_term_id)
--    Batch creates fee accounts for all enrolled students in a term
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fee_accounts_for_term(
    p_school_id uuid,
    p_term_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int := 0;
    v_rec record;
    v_academic_year_id uuid;
    v_total_expected numeric;
BEGIN
    -- Get the academic year for this term
    SELECT academic_year_id INTO v_academic_year_id
    FROM terms
    WHERE id = p_term_id AND school_id = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Term % not found for school %', p_term_id, p_school_id;
    END IF;

    -- Loop through all enrolled students for this term
    FOR v_rec IN
        SELECT DISTINCT ce.student_id
        FROM class_enrollments ce
        JOIN students s ON s.id = ce.student_id
        WHERE ce.term_id = p_term_id
          AND s.school_id = p_school_id
          AND s.status = 'active'
          AND s.is_deleted = false
          AND ce.is_deleted = false
          AND NOT EXISTS (
              SELECT 1 FROM fee_accounts fa
              WHERE fa.student_id = ce.student_id
                AND fa.term_id = p_term_id
                AND fa.is_deleted = false
          )
    LOOP
        -- Calculate total_expected for this student
        SELECT COALESCE(SUM(fs.amount), 0)
        INTO v_total_expected
        FROM fee_structures fs
        JOIN students st ON st.id = v_rec.student_id
        WHERE fs.term_id = p_term_id
          AND fs.school_id = p_school_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

        INSERT INTO fee_accounts (
            school_id,
            student_id,
            term_id,
            academic_year_id,
            total_expected,
            total_paid,
            balance,
            status
        ) VALUES (
            p_school_id,
            v_rec.student_id,
            p_term_id,
            v_academic_year_id,
            v_total_expected,
            0,
            v_total_expected,
            CASE WHEN v_total_expected > 0 THEN 'unpaid'::fee_account_status ELSE 'paid'::fee_account_status END
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;


-- ============================================
-- Migration: 00006_notification_preferences.sql
-- ============================================

-- notification_preferences: per-school toggle config for automated SMS
CREATE TABLE notification_preferences (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id                   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    send_receipt_sms            boolean NOT NULL DEFAULT true,
    send_absence_sms            boolean NOT NULL DEFAULT true,
    send_weekly_defaulter       boolean NOT NULL DEFAULT true,
    defaulter_reminder_day      int NOT NULL DEFAULT 1, -- 1=Monday, 7=Sunday
    defaulter_reminder_hour     int NOT NULL DEFAULT 8,
    send_report_card_sms        boolean NOT NULL DEFAULT true,
    send_term_start_sms         boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    is_deleted                  boolean NOT NULL DEFAULT false,
    UNIQUE (school_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_admin_manage_notif_prefs"
    ON notification_preferences FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

CREATE POLICY "super_admin_notif_prefs"
    ON notification_preferences FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');


-- ============================================
-- Migration: 00007_marks_review_status.sql
-- ============================================

-- Add review status to marks table for the approval workflow
ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    review_status text NOT NULL DEFAULT 'not_started'
    CHECK (review_status IN ('not_started', 'draft', 'submitted', 'approved', 'rejected'));

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    review_comment text;

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    reviewed_by uuid REFERENCES users(id);

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    reviewed_at timestamptz;

-- Index for review status queries
CREATE INDEX IF NOT EXISTS idx_marks_review_status
    ON marks(school_id, class_id, term_id, review_status)
    WHERE is_deleted = false;


-- ============================================
-- Migration: 00008_fee_structure_audit_log.sql
-- ============================================

CREATE TABLE fee_structure_audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_structure_id uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    changed_by      uuid REFERENCES users(id),
    action          text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    old_value       jsonb,
    new_value       jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fee_structure_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_members_read_fee_audit"
    ON fee_structure_audit_log FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "system_insert_fee_audit"
    ON fee_structure_audit_log FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY "super_admin_fee_audit"
    ON fee_structure_audit_log FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');


-- ============================================
-- Migration: 00009_in_app_notifications.sql
-- ============================================

CREATE TABLE in_app_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           text NOT NULL,
    body            text,
    type            text NOT NULL DEFAULT 'info'
                    CHECK (type IN ('info', 'warning', 'success', 'error')),
    is_read         boolean NOT NULL DEFAULT false,
    related_entity_type text,
    related_entity_id   uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications"
    ON in_app_notifications FOR SELECT
    USING (recipient_user_id = auth.uid());

CREATE POLICY "users_update_own_notifications"
    ON in_app_notifications FOR UPDATE
    USING (recipient_user_id = auth.uid());

CREATE POLICY "school_admin_insert_notifications"
    ON in_app_notifications FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE INDEX idx_notifications_user_unread
    ON in_app_notifications(recipient_user_id, is_read, created_at DESC)
    WHERE is_deleted = false;


-- ============================================
-- Migration: 00010_api_key_encryption.sql
-- ============================================

-- Enable pgcrypto for encrypting Africa's Talking API keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to encrypt a secret value
CREATE OR REPLACE FUNCTION encrypt_secret(secret text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
    SELECT encode(pgp_sym_encrypt(secret, key), 'base64');
$$;

-- Function to decrypt a secret value
CREATE OR REPLACE FUNCTION decrypt_secret(encrypted text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
    SELECT pgp_sym_decrypt(decode(encrypted, 'base64'), key);
$$;

-- Add encrypted columns to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS africas_talking_api_key_enc text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS africas_talking_username_enc text;

COMMENT ON COLUMN schools.africas_talking_api_key_enc IS 'pgp_sym_encrypt encrypted AT API key';
COMMENT ON COLUMN schools.africas_talking_username_enc IS 'pgp_sym_encrypt encrypted AT username';


-- ============================================
-- Migration: 00011_scheduled_announcements.sql
-- ============================================

-- Support scheduled SMS send (datetime picker on compose page)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS
    scheduled_status text NOT NULL DEFAULT 'pending'
    CHECK (scheduled_status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'));

CREATE INDEX idx_announcements_scheduled
    ON announcements(scheduled_at, scheduled_status)
    WHERE scheduled_at IS NOT NULL AND scheduled_status = 'pending';


-- ============================================
-- Migration: 00012_grading_scales.sql
-- ============================================

-- Per-school configurable grading scales
CREATE TABLE grading_scales (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    grade       text NOT NULL,
    min_score   numeric NOT NULL,
    max_score   numeric NOT NULL,
    label       text,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, grade)
);

ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_admin_manage_grades"
    ON grading_scales FOR ALL
    USING (school_id = get_user_school_id());

-- Seed defaults when a school is created (via trigger)
CREATE OR REPLACE FUNCTION seed_default_grading_scale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO grading_scales (school_id, grade, min_score, max_score, label, sort_order) VALUES
        (NEW.id, 'A', 80, 100, 'Distinction', 1),
        (NEW.id, 'B', 70, 79,  'Credit',      2),
        (NEW.id, 'C', 60, 69,  'Merit',       3),
        (NEW.id, 'D', 50, 59,  'Pass',        4),
        (NEW.id, 'F',  0, 49,  'Fail',        5);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_seed_grading_scale
    AFTER INSERT ON schools
    FOR EACH ROW EXECUTE FUNCTION seed_default_grading_scale();


-- ============================================
-- Migration: 00013_student_exit_date.sql
-- ============================================

-- Add exit_date to students for transfer/graduated status
ALTER TABLE students ADD COLUMN IF NOT EXISTS exit_date date;


-- ============================================
-- Migration: 00014_platform_settings.sql
-- ============================================

CREATE TABLE platform_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid REFERENCES users(id)
);

INSERT INTO platform_settings (key, value) VALUES
    ('sms_rate_ugx', '25'),
    ('transaction_fee_pct', '1.5'),
    ('feature_flags', '{"starter": {"mobile_money": false, "report_cards": true}, "growth": {"mobile_money": true, "report_cards": true}, "pro": {"mobile_money": true, "report_cards": true, "payroll": true}}');


-- ============================================
-- Migration: 00015_composite_indexes.sql
-- ============================================

-- Composite and partial indexes for performance optimization

-- Payment date index for financial reports (composite)
CREATE INDEX IF NOT EXISTS idx_fee_payments_date
    ON fee_payments(school_id, payment_date, status);

-- Parent phone for portal login (partial — only non-deleted students)
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_active
    ON students(parent_phone)
    WHERE is_deleted = false;

-- Marks review status (composite — class+term+subject for marks sheet queries)
CREATE INDEX IF NOT EXISTS idx_marks_class_term_subject
    ON marks(school_id, class_id, term_id, subject_id);

-- SMS delivery queries (composite)
CREATE INDEX IF NOT EXISTS idx_sms_logs_status_date
    ON sms_logs(school_id, status, sent_at);


-- ============================================
-- Migration: 00016_teacher_role_and_assignments.sql
-- ============================================

-- ============================================
-- Migration: 00016_teacher_role_and_assignments.sql
-- ============================================

-- Add TEACHER role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'TEACHER';

-- teacher_class_assignments: which teacher owns which classes/subjects
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES subjects(id) ON DELETE CASCADE, -- null = class teacher (homeroom)
  is_class_teacher boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false,
  UNIQUE (school_id, teacher_id, class_id, subject_id)
);

ALTER TABLE teacher_class_assignments ENABLE ROW LEVEL SECURITY;

-- School admins can manage all assignments
CREATE POLICY "school_admin_manage_assignments"
  ON teacher_class_assignments FOR ALL
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN'))
  WITH CHECK (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN'));

-- Teachers can view their own assignments
CREATE POLICY "teacher_view_own_assignments"
  ON teacher_class_assignments FOR SELECT
  USING (teacher_id = auth.uid() AND school_id = get_user_school_id());

-- Teachers can insert/update marks only for their assigned class+subject
CREATE POLICY "teacher_write_own_marks"
  ON marks FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = marks.class_id
        AND tca.subject_id = marks.subject_id
        AND tca.is_deleted = false
    )
  );

-- Allow teachers to update marks they created
CREATE POLICY "teacher_update_own_marks"
  ON marks FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = marks.class_id
        AND tca.subject_id = marks.subject_id
        AND tca.is_deleted = false
    )
  );

-- Teachers can only write attendance for their homeroom class
CREATE POLICY "teacher_write_own_attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = attendance_records.class_id
        AND tca.is_class_teacher = true
        AND tca.is_deleted = false
    )
  );

-- Allow teachers to update attendance they created
CREATE POLICY "teacher_update_own_attendance"
  ON attendance_records FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = attendance_records.class_id
        AND tca.is_class_teacher = true
        AND tca.is_deleted = false
    )
  );

-- Index for fast lookups of teacher assignments
CREATE INDEX idx_teacher_class_assignments_teacher
  ON teacher_class_assignments(teacher_id, school_id, is_deleted)
  WHERE is_deleted = false;

CREATE INDEX idx_teacher_class_assignments_class
  ON teacher_class_assignments(class_id, school_id, is_deleted)
  WHERE is_deleted = false;


-- ============================================
-- Migration: 00017_timetable.sql
-- ============================================

-- Migration 00017: Timetable Builder
-- Adds support for school periods and class timetables

CREATE TABLE IF NOT EXISTS timetable_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,       -- e.g. "Period 1"
  start_time  time NOT NULL,       -- e.g. 08:00
  end_time    time NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_break    boolean NOT NULL DEFAULT false, -- lunch, recess
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  period_id   uuid NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Mon, 5=Fri
  subject_id  uuid REFERENCES subjects(id),
  teacher_id  uuid REFERENCES users(id),
  room        text,
  academic_year_id uuid REFERENCES academic_years(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id, period_id, day_of_week, academic_year_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_timetable_periods_school ON timetable_periods(school_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class ON timetable_slots(class_id, day_of_week, is_deleted);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher ON timetable_slots(teacher_id, day_of_week, period_id, is_deleted);

-- RLS
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "school_admin_manage_periods" ON timetable_periods FOR ALL
  USING (school_id = get_user_school_id());

CREATE POLICY "school_admin_manage_slots" ON timetable_slots FOR ALL
  USING (school_id = get_user_school_id());

-- Teachers can view slots for their assigned classes
CREATE POLICY "teacher_view_slots" ON timetable_slots FOR SELECT
  USING (
    school_id = get_user_school_id() 
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = timetable_slots.class_id
        AND tca.is_deleted = false
    )
  );


-- ============================================
-- Migration: 00018_academic_calendar.sql
-- ============================================

-- Migration 00018: Academic Calendar with Holidays
-- Creates calendar_events table for managing school holidays, exams, events, and closures

CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  event_date  date NOT NULL,
  end_date    date,
  event_type  text NOT NULL DEFAULT 'event'
              CHECK (event_type IN ('holiday', 'exam', 'event', 'closure', 'meeting')),
  affects_attendance boolean NOT NULL DEFAULT true,
  class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
  is_public   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- School admins can manage all calendar events
CREATE POLICY "school_admin_manage_calendar" ON calendar_events FOR ALL
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'ADMIN'));

-- Teachers can view and create events for their classes
CREATE POLICY "teacher_manage_class_calendar" ON calendar_events FOR ALL
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM teacher_class_assignments tca
        WHERE tca.teacher_id = auth.uid()
          AND tca.class_id = calendar_events.class_id
          AND tca.is_deleted = false
      )
    )
  );

-- Parents can view public events for their children's school/class
CREATE POLICY "portal_view_public_calendar" ON calendar_events FOR SELECT
  USING (
    is_public = true
    AND school_id IN (
      SELECT s.school_id
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
    AND (
      class_id IS NULL
      OR class_id IN (
        SELECT student.class_id
        FROM students student
        JOIN parent_students ps ON ps.student_id = student.id
        WHERE ps.parent_id = auth.uid()
      )
    )
  );

-- Index for efficient date-based queries
CREATE INDEX idx_calendar_events_date ON calendar_events(school_id, event_date)
  WHERE is_deleted = false;

-- Index for class-specific events
CREATE INDEX idx_calendar_events_class ON calendar_events(class_id)
  WHERE is_deleted = false;

-- Comment on table
COMMENT ON TABLE calendar_events IS 'Stores school calendar events including holidays, exams, meetings, and closures. affects_attendance=true events are excluded from attendance percentage calculations.';


-- ============================================
-- Migration: 00019_discipline.sql
-- ============================================

-- Migration 00019: Student Discipline Log
-- Creates discipline_records table with RLS policies

-- Add incident_type to check constraint
CREATE TYPE IF NOT EXISTS discipline_incident_type AS ENUM (
  'verbal_warning',
  'written_warning',
  'detention',
  'suspension',
  'parent_called',
  'referred_to_head',
  'other'
);

CREATE TABLE IF NOT EXISTS discipline_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  incident_date   date NOT NULL,
  incident_type   discipline_incident_type NOT NULL,
  description     text NOT NULL,
  action_taken    text,
  recorded_by     uuid REFERENCES users(id),
  parent_notified boolean NOT NULL DEFAULT false,
  parent_notified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE discipline_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "school_manage_discipline" ON discipline_records;
DROP POLICY IF EXISTS "super_admin_discipline" ON discipline_records;

-- School admins and teachers can manage discipline records for their school
CREATE POLICY "school_manage_discipline"
  ON discipline_records FOR ALL
  USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
  );

-- Super admins have full access
CREATE POLICY "super_admin_discipline"
  ON discipline_records FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');

-- Index for fast lookups by student and date
CREATE INDEX IF NOT EXISTS idx_discipline_student
  ON discipline_records(school_id, student_id, incident_date DESC)
  WHERE is_deleted = false;

-- Comment on table
COMMENT ON TABLE discipline_records IS 'Stores student disciplinary incidents and actions taken';


-- ============================================
-- Migration: 00020_fee_discounts.sql
-- ============================================

-- =============================================================================
-- SKULI SaaS: Fee Discounts / Scholarships
-- Migration 00020
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. fee_discounts — defines discount types per school
-- ---------------------------------------------------------------------------
CREATE TABLE fee_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  discount_type discount_type NOT NULL DEFAULT 'percentage',
  value         numeric NOT NULL,
  max_amount    numeric,
  is_recurring  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_fee_discounts_school ON fee_discounts(school_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 2. student_discounts — assigns discounts to students
-- ---------------------------------------------------------------------------
CREATE TABLE student_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  discount_id   uuid NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
  term_id       uuid REFERENCES terms(id),
  approved_by   uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_student_discounts_school ON student_discounts(school_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_student ON student_discounts(student_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_discount ON student_discounts(discount_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_term ON student_discounts(term_id) WHERE is_deleted = false;

-- Conditional unique indexes to enforce uniqueness with nullable term_id
CREATE UNIQUE INDEX uq_student_discounts_with_term
  ON student_discounts(student_id, discount_id, term_id)
  WHERE term_id IS NOT NULL AND is_deleted = false;

CREATE UNIQUE INDEX uq_student_discounts_no_term
  ON student_discounts(student_id, discount_id)
  WHERE term_id IS NULL AND is_deleted = false;

-- ---------------------------------------------------------------------------
-- 3. RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;

-- fee_discounts: Super admin full access
CREATE POLICY "super_admin_all_fee_discounts" ON fee_discounts FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');

-- fee_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_discounts" ON fee_discounts FOR ALL
  USING (school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- student_discounts: Super admin full access
CREATE POLICY "super_admin_all_student_discounts" ON student_discounts FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');

-- student_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_student_discounts" ON student_discounts FOR ALL
  USING (school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- student_discounts: Parents read-only for own children
CREATE POLICY "parent_read_student_discounts" ON student_discounts FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'PARENT'
    AND student_id IN (
      SELECT s.id FROM students s
      WHERE s.parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
        AND s.school_id = get_user_school_id()
        AND s.is_deleted = false
    )
  );

-- ---------------------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Updated recalculate_fee_account() — subtracts applicable discounts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account fee_accounts%ROWTYPE;
    v_total_expected numeric;
    v_total_paid numeric;
    v_total_discount numeric;
    v_balance numeric;
    v_status fee_account_status;
BEGIN
    -- Fetch the account
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- Calculate total_expected from fee_structures for this term/class
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_total_expected
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id = v_account.term_id
      AND fs.school_id = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- Calculate total discount applicable to this student/term
    SELECT COALESCE(SUM(
      CASE
        WHEN fd.discount_type = 'percentage' THEN
          LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
        ELSE fd.value
      END
    ), 0)
    INTO v_total_discount
    FROM student_discounts sd
    JOIN fee_discounts fd ON fd.id = sd.discount_id
    WHERE sd.student_id = v_account.student_id
      AND (sd.term_id = v_account.term_id OR sd.term_id IS NULL)
      AND sd.is_deleted = false
      AND fd.is_deleted = false;

    -- Apply discount, ensure non-negative
    v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

    -- Calculate total_paid from confirmed fee_payments
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status = 'confirmed'
      AND fp.is_deleted = false;

    -- Calculate balance
    v_balance := v_total_expected - v_total_paid;

    -- Determine status
    IF v_balance = 0 AND v_total_expected > 0 THEN
        v_status := 'paid';
    ELSIF v_balance > 0 AND v_total_paid > 0 THEN
        v_status := 'partial';
    ELSIF v_balance < 0 THEN
        v_status := 'overpaid';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- Update the account
    UPDATE fee_accounts
    SET total_expected = v_total_expected,
        total_paid = v_total_paid,
        balance = v_balance,
        status = v_status
    WHERE id = p_account_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Updated create_fee_accounts_for_term() — subtracts discounts on creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fee_accounts_for_term(
    p_school_id uuid,
    p_term_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int := 0;
    v_rec record;
    v_academic_year_id uuid;
    v_total_expected numeric;
    v_total_discount numeric;
BEGIN
    -- Get the academic year for this term
    SELECT academic_year_id INTO v_academic_year_id
    FROM terms
    WHERE id = p_term_id AND school_id = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Term % not found for school %', p_term_id, p_school_id;
    END IF;

    -- Loop through all enrolled students for this term
    FOR v_rec IN
        SELECT DISTINCT ce.student_id
        FROM class_enrollments ce
        JOIN students s ON s.id = ce.student_id
        WHERE ce.term_id = p_term_id
          AND s.school_id = p_school_id
          AND s.status = 'active'
          AND s.is_deleted = false
          AND ce.is_deleted = false
          AND NOT EXISTS (
              SELECT 1 FROM fee_accounts fa
              WHERE fa.student_id = ce.student_id
                AND fa.term_id = p_term_id
                AND fa.is_deleted = false
          )
    LOOP
        -- Calculate total_expected for this student
        SELECT COALESCE(SUM(fs.amount), 0)
        INTO v_total_expected
        FROM fee_structures fs
        JOIN students st ON st.id = v_rec.student_id
        WHERE fs.term_id = p_term_id
          AND fs.school_id = p_school_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

        -- Calculate discount for this student/term
        SELECT COALESCE(SUM(
          CASE
            WHEN fd.discount_type = 'percentage' THEN
              LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
            ELSE fd.value
          END
        ), 0)
        INTO v_total_discount
        FROM student_discounts sd
        JOIN fee_discounts fd ON fd.id = sd.discount_id
        WHERE sd.student_id = v_rec.student_id
          AND (sd.term_id = p_term_id OR sd.term_id IS NULL)
          AND sd.is_deleted = false
          AND fd.is_deleted = false;

        v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

        INSERT INTO fee_accounts (
            school_id,
            student_id,
            term_id,
            academic_year_id,
            total_expected,
            total_paid,
            balance,
            status
        ) VALUES (
            p_school_id,
            v_rec.student_id,
            p_term_id,
            v_academic_year_id,
            v_total_expected,
            0,
            v_total_expected,
            CASE WHEN v_total_expected > 0 THEN 'unpaid'::fee_account_status ELSE 'paid'::fee_account_status END
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;


-- ============================================
-- Migration: 00021_expenses.sql
-- ============================================

-- Expense payment method enum
CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank', 'mobile_money', 'cheque');

-- Expense categories
CREATE TABLE expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_deleted  boolean NOT NULL DEFAULT false
);

-- Expenses
CREATE TABLE expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES expense_categories(id),
  term_id         uuid REFERENCES terms(id),
  description     text NOT NULL,
  amount          numeric NOT NULL,
  expense_date    date NOT NULL,
  payment_method  expense_payment_method,
  receipt_number  text,
  recorded_by     uuid REFERENCES users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_expense_categories" ON expense_categories
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expense_cats" ON expense_categories
  FOR ALL USING (school_id = get_user_school_id());

CREATE POLICY "super_admin_all_expenses" ON expenses
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expenses" ON expenses
  FOR ALL USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
  );

-- Index for dashboard queries
CREATE INDEX idx_expenses_date ON expenses(school_id, expense_date, term_id)
  WHERE is_deleted = false;


-- ============================================
-- Migration: 00022_meetings.sql
-- ============================================

-- Migration 00022: Parent-Teacher Meeting Scheduler
-- Creates meeting_slots and meeting_bookings tables with RLS and helper function

-- Meeting slots (teacher availability)
CREATE TABLE meeting_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  slot_date       date NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 15,
  is_booked       boolean NOT NULL DEFAULT false,
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Meeting bookings (parent reservations)
CREATE TABLE meeting_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid NOT NULL REFERENCES meeting_slots(id) ON DELETE CASCADE,
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_name     text NOT NULL,
  parent_phone    text NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  reminder_sent   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_meeting_slots_teacher_date ON meeting_slots(school_id, teacher_id, slot_date)
  WHERE is_deleted = false;

CREATE INDEX idx_meeting_slots_available ON meeting_slots(school_id, slot_date, is_booked)
  WHERE is_deleted = false AND is_booked = false;

CREATE INDEX idx_meeting_bookings_slot ON meeting_bookings(slot_id)
  WHERE status = 'confirmed';

CREATE INDEX idx_meeting_bookings_reminder ON meeting_bookings(school_id, reminder_sent, status)
  WHERE status = 'confirmed' AND reminder_sent = false;

-- RLS
ALTER TABLE meeting_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_bookings ENABLE ROW LEVEL SECURITY;

-- Admins can manage all slots for their school
CREATE POLICY "school_manage_slots" ON meeting_slots FOR ALL
  USING (school_id = get_user_school_id());

-- Admins can manage all bookings for their school
CREATE POLICY "school_manage_bookings" ON meeting_bookings FOR ALL
  USING (school_id = get_user_school_id());

-- Parents can view bookings for their linked students
CREATE POLICY "portal_view_bookings" ON meeting_bookings FOR SELECT
  USING (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Parents can insert bookings for their linked students
CREATE POLICY "portal_insert_bookings" ON meeting_bookings FOR INSERT
  WITH CHECK (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Parents can update (cancel) their own bookings
CREATE POLICY "portal_update_bookings" ON meeting_bookings FOR UPDATE
  USING (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Helper function: generate meeting slots for a teacher on a given date
CREATE OR REPLACE FUNCTION generate_meeting_slots(
  p_school_id uuid,
  p_teacher_id uuid,
  p_slot_date date,
  p_start_time time,
  p_end_time time,
  p_duration_minutes int DEFAULT 15
) RETURNS void AS $$
DECLARE
  slot_start time;
  slot_end time;
BEGIN
  slot_start := p_start_time;
  LOOP
    slot_end := slot_start + (p_duration_minutes || ' minutes')::interval;
    EXIT WHEN slot_end > p_end_time;

    -- Skip if slot already exists
    IF NOT EXISTS (
      SELECT 1 FROM meeting_slots
      WHERE school_id = p_school_id
        AND teacher_id = p_teacher_id
        AND slot_date = p_slot_date
        AND start_time = slot_start
        AND is_deleted = false
    ) THEN
      INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes)
      VALUES (p_school_id, p_teacher_id, p_slot_date, slot_start, slot_end, p_duration_minutes);
    END IF;

    slot_start := slot_end;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Migration: 00023_message_threads.sql
-- ============================================

-- Migration 00023: Two-Way Parent Messaging
-- Creates message_threads and thread_messages tables with RLS

-- Message threads (one per parent phone per school)
CREATE TABLE message_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_phone    text NOT NULL,
  student_id      uuid REFERENCES students(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  is_read         boolean NOT NULL DEFAULT false,
  is_deleted      boolean NOT NULL DEFAULT false,
  UNIQUE (school_id, parent_phone)
);

-- Thread messages (individual messages)
CREATE TABLE thread_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body            text NOT NULL,
  sender_name     text,
  at_message_id   text,
  status          text NOT NULL DEFAULT 'delivered'
                  CHECK (status IN ('sent', 'delivered', 'failed')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_threads_last_msg ON message_threads(school_id, last_message_at DESC)
  WHERE is_deleted = false;

CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, sent_at)
  WHERE is_deleted = false;

-- RLS
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_manage_threads" ON message_threads FOR ALL
  USING (school_id = get_user_school_id());

CREATE POLICY "school_manage_thread_msgs" ON thread_messages FOR ALL
  USING (school_id = get_user_school_id());


-- ============================================
-- Migration: 00024_push_subscriptions.sql
-- ============================================

-- Push notification subscriptions for PWA
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false,
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage their own subscriptions
CREATE POLICY "users_own_push_subscriptions" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- School admins can view subscriptions in their school
CREATE POLICY "school_admin_view_push_subscriptions" ON push_subscriptions FOR SELECT
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'));

-- SUPER_ADMIN sees all
CREATE POLICY "super_admin_push_subscriptions" ON push_subscriptions FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');


-- ============================================
-- Migration: 00025_push_queue.sql
-- ============================================

-- Queue for push notifications from edge functions (Deno can't use web-push)
CREATE TABLE push_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  url        text,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  error      text
);

ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) and admins can access
CREATE POLICY "service_role_push_queue" ON push_queue FOR ALL
  USING (true);

-- Add index for efficient polling
CREATE INDEX idx_push_queue_pending ON push_queue (status, created_at) WHERE status = 'pending';


-- ============================================
-- Migration: 00026_school_groups.sql
-- ============================================

-- =============================================================================
-- Multi-School Group (Chain Admin)
-- Migration 00026
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. school_groups
-- ---------------------------------------------------------------------------
CREATE TABLE school_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. Link schools to groups
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN group_id uuid REFERENCES school_groups(id);

-- ---------------------------------------------------------------------------
-- 3. group_admins
-- ---------------------------------------------------------------------------
CREATE TABLE group_admins (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Add GROUP_ADMIN role
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GROUP_ADMIN';

-- ---------------------------------------------------------------------------
-- 5. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Helper function: school IDs for current user's group
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT s.id FROM schools s
    JOIN group_admins ga ON ga.group_id = s.group_id
    WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS Policies: school_groups
-- ---------------------------------------------------------------------------

CREATE POLICY "super_admin_all_school_groups"
    ON school_groups FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "group_admin_view_own_group"
    ON school_groups FOR SELECT
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

CREATE POLICY "group_admin_update_own_group"
    ON school_groups FOR UPDATE
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 8. RLS Policies: group_admins
-- ---------------------------------------------------------------------------

CREATE POLICY "super_admin_all_group_admins"
    ON group_admins FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "group_admin_manage_group_admins"
    ON group_admins FOR ALL
    USING (
        group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 9. RLS Policies: GROUP_ADMIN read access to operational tables
-- ---------------------------------------------------------------------------

CREATE POLICY "group_admin_read_students" ON students FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_fee_accounts" ON fee_accounts FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_fee_payments" ON fee_payments FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_attendance" ON attendance_records FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_marks" ON marks FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_report_cards" ON report_cards FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_classes" ON classes FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_terms" ON terms FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_academic_years" ON academic_years FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_staff" ON staff FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_subjects" ON subjects FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_sms_logs" ON sms_logs FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- ---------------------------------------------------------------------------
-- 10. RLS Policies: GROUP_ADMIN write access to schools
-- ---------------------------------------------------------------------------

CREATE POLICY "group_admin_insert_schools" ON schools FOR INSERT
    WITH CHECK (
        get_user_role() = 'GROUP_ADMIN'
        AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

CREATE POLICY "group_admin_update_group_schools" ON schools FOR UPDATE
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND id IN (SELECT get_user_group_school_ids())
    );


-- ============================================
-- Migration: 00027_library.sql
-- ============================================

-- =============================================================================
-- Library Management
-- Migration 00027
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. library_books
-- ---------------------------------------------------------------------------
CREATE TABLE library_books (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title            text NOT NULL,
    author           text,
    isbn             text,
    category         text,
    total_copies     int NOT NULL DEFAULT 1,
    available_copies int NOT NULL DEFAULT 1,
    shelf_location   text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    is_deleted       boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. library_issues
-- ---------------------------------------------------------------------------
CREATE TABLE library_issues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id      uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    due_date     date NOT NULL,
    returned_at  timestamptz,
    fine_amount  numeric,
    fine_paid    boolean NOT NULL DEFAULT false,
    issued_by    uuid REFERENCES users(id),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_issues ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. RLS Policies: library_books
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_library_books" ON library_books FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 5. RLS Policies: library_issues
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_library_issues" ON library_issues FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_books
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_issues
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_library_books_school ON library_books(school_id) WHERE is_deleted = false;
CREATE INDEX idx_library_books_isbn ON library_books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX idx_library_issues_school ON library_issues(school_id);
CREATE INDEX idx_library_issues_book ON library_issues(book_id);
CREATE INDEX idx_library_issues_student ON library_issues(student_id);
CREATE INDEX idx_library_issues_due ON library_issues(due_date) WHERE returned_at IS NULL;


-- ============================================
-- Migration: 00029_assets.sql
-- ============================================

-- =============================================================================
-- Assets & Inventory Management
-- Migration 00029
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. asset_condition enum
-- ---------------------------------------------------------------------------
CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'written_off');

-- ---------------------------------------------------------------------------
-- 2. assets
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    asset_code      text,
    category        text,
    purchase_date   date,
    purchase_price  numeric,
    current_value   numeric,
    condition       asset_condition NOT NULL DEFAULT 'good',
    location        text,
    assigned_to     uuid REFERENCES users(id),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. asset_maintenance
-- ---------------------------------------------------------------------------
CREATE TABLE asset_maintenance (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id          uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    maintenance_date  date NOT NULL,
    description       text NOT NULL,
    cost              numeric,
    next_service_date date,
    performed_by      text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. RLS Policies: assets
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_assets" ON assets FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 6. RLS Policies: asset_maintenance
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_maintenance" ON asset_maintenance FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_maintenance
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_assets_school ON assets(school_id) WHERE is_deleted = false;
CREATE INDEX idx_assets_category ON assets(category) WHERE is_deleted = false;
CREATE INDEX idx_assets_code ON assets(asset_code) WHERE asset_code IS NOT NULL;
CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX idx_asset_maintenance_school ON asset_maintenance(school_id);
CREATE INDEX idx_asset_maintenance_next_service ON asset_maintenance(next_service_date) WHERE next_service_date IS NOT NULL;


-- ============================================
-- Migration: 00030_analytics_views.sql
-- ============================================

-- Migration: Analytics helper views for Advanced Analytics Dashboard (Step 18)

-- View: class_fee_summary — per-class fee collection stats for current term
CREATE OR REPLACE VIEW class_fee_summary AS
SELECT
  fa.school_id,
  s.current_class_id AS class_id,
  c.name AS class_name,
  COUNT(DISTINCT fa.student_id) AS student_count,
  SUM(fa.total_expected) AS total_expected,
  SUM(fa.total_paid) AS total_paid,
  SUM(fa.balance) AS total_balance,
  ROUND((SUM(fa.total_paid) / NULLIF(SUM(fa.total_expected), 0)) * 100, 1) AS collection_rate_pct
FROM fee_accounts fa
JOIN students s ON s.id = fa.student_id
JOIN classes c ON c.id = s.current_class_id
WHERE fa.is_deleted = false AND s.is_deleted = false AND s.status = 'active'
GROUP BY fa.school_id, s.current_class_id, c.name;

-- View: subject_performance_summary — per-class per-subject marks stats
CREATE OR REPLACE VIEW subject_performance_summary AS
SELECT
  m.school_id,
  m.class_id,
  c.name AS class_name,
  m.subject_id,
  sub.name AS subject_name,
  m.term_id,
  COUNT(DISTINCT m.student_id) AS student_count,
  ROUND(AVG(m.score / NULLIF(m.max_score, 0) * 100), 1) AS avg_pct,
  MAX(m.score) AS max_score,
  MIN(m.score) AS min_score
FROM marks m
JOIN classes c ON c.id = m.class_id
JOIN subjects sub ON sub.id = m.subject_id
WHERE m.is_deleted = false AND m.review_status IN ('approved', 'submitted')
GROUP BY m.school_id, m.class_id, c.name, m.subject_id, sub.name, m.term_id;

-- View: attendance_weekly_summary — weekly attendance rates by class
CREATE OR REPLACE VIEW attendance_weekly_summary AS
SELECT
  ar.school_id,
  ar.class_id,
  c.name AS class_name,
  DATE_TRUNC('week', ar.date::date) AS week_start,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status = 'present')::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  ) AS attendance_pct
FROM attendance_records ar
JOIN classes c ON c.id = ar.class_id
WHERE ar.is_deleted = false
GROUP BY ar.school_id, ar.class_id, c.name, DATE_TRUNC('week', ar.date::date);


-- ============================================
-- Migration: 00032_performance_indexes.sql
-- ============================================

-- Migration: Performance indexes for common query patterns (Step 20)

-- Group analytics
CREATE INDEX IF NOT EXISTS idx_schools_group ON schools(group_id) WHERE group_id IS NOT NULL;

-- Library
CREATE INDEX IF NOT EXISTS idx_library_issues_student ON library_issues(school_id, student_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_library_issues_overdue ON library_issues(school_id, due_date) WHERE returned_at IS NULL;

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_term ON expenses(school_id, term_id, expense_date);

-- Message threads
CREATE INDEX IF NOT EXISTS idx_threads_phone ON message_threads(school_id, parent_phone);

-- Alumni
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni(school_id, graduation_year);

-- Assets
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(school_id, category) WHERE is_deleted = false;

-- Discipline
CREATE INDEX IF NOT EXISTS idx_discipline_student ON discipline_records(school_id, student_id) WHERE is_deleted = false;

-- Calendar
CREATE INDEX IF NOT EXISTS idx_calendar_term ON calendar_events(school_id, event_date, event_type) WHERE is_deleted = false;


-- ============================================
-- Migration: 00033_alumni.sql
-- ============================================

-- Migration: Alumni table

CREATE TABLE IF NOT EXISTS alumni (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid REFERENCES students(id) ON DELETE SET NULL,
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    admission_number text,
    graduation_year integer NOT NULL,
    last_class      text,
    current_school  text,
    phone           text,
    email           text,
    profession      text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alumni_school ON alumni(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni(school_id, graduation_year);

-- RLS
ALTER TABLE alumni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alumni_school_access" ON alumni
    FOR ALL USING (
        school_id IN (
            SELECT school_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Updated at trigger
CREATE TRIGGER set_alumni_updated_at
    BEFORE UPDATE ON alumni
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================
-- Migration: 00034_attendance_view_holiday_adjustment.sql
-- ============================================

-- Migration: Update attendance_weekly_summary to subtract holidays
-- Holidays with affects_attendance=true are excluded from the attendance denominator

CREATE OR REPLACE VIEW attendance_weekly_summary AS
WITH holiday_dates AS (
  SELECT
    ce.school_id,
    d::date AS holiday_date
  FROM calendar_events ce,
    LATERAL generate_series(
      ce.event_date::date,
      COALESCE(ce.end_date::date, ce.event_date::date),
      '1 day'::interval
    ) d
  WHERE ce.affects_attendance = true
    AND ce.is_deleted = false
)
SELECT
  ar.school_id,
  ar.class_id,
  c.name AS class_name,
  DATE_TRUNC('week', ar.date::date) AS week_start,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status = 'present')::numeric
    / NULLIF(COUNT(*) - COUNT(DISTINCT CASE WHEN hd.holiday_date IS NOT NULL THEN ar.date::date END), 0)
    * 100,
    1
  ) AS attendance_pct
FROM attendance_records ar
JOIN classes c ON c.id = ar.class_id
LEFT JOIN holiday_dates hd ON hd.school_id = ar.school_id AND hd.holiday_date = ar.date::date
WHERE ar.is_deleted = false
GROUP BY ar.school_id, ar.class_id, c.name, DATE_TRUNC('week', ar.date::date);


-- ============================================
-- Migration: 00035_sms_templates.sql
-- ============================================

-- Migration: SMS templates table

CREATE TABLE IF NOT EXISTS sms_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    body            text NOT NULL,
    variables       text[] DEFAULT '{}',
    is_default      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_school ON sms_templates(school_id) WHERE is_deleted = false;

-- RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_templates_school_access" ON sms_templates
    FOR ALL USING (
        school_id IN (
            SELECT school_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Updated at trigger
CREATE TRIGGER set_sms_templates_updated_at
    BEFORE UPDATE ON sms_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Insert default templates for existing schools
INSERT INTO sms_templates (school_id, name, body, variables, is_default)
SELECT
    s.id,
    t.name,
    t.body,
    t.variables::text[],
    true
FROM schools s
CROSS JOIN (
    VALUES
        ('Fee Reminder', 'Dear {parent_name}, this is a reminder that {student_name}''s fee balance is {balance}. Please make payment before {due_date}.', ARRAY['parent_name', 'student_name', 'balance', 'due_date']),
        ('Payment Receipt', 'Dear {parent_name}, we have received your payment of {amount} for {student_name}. Receipt No: {receipt_number}. Thank you.', ARRAY['parent_name', 'amount', 'student_name', 'receipt_number']),
        ('Exam Results Ready', 'Dear {parent_name}, {student_name}''s exam results for {term} are now available. Average: {average}%. Please check the portal.', ARRAY['parent_name', 'student_name', 'term', 'average']),
        ('Absence Alert', 'Dear {parent_name}, {student_name} was absent from school today ({date}). Please contact the school if this is an error.', ARRAY['parent_name', 'student_name', 'date']),
        ('School Closure', 'Dear parents, {school_name} will be closed on {date} due to {reason}. Normal operations resume on {resume_date}.', ARRAY['school_name', 'date', 'reason', 'resume_date']),
        ('Event Reminder', 'Reminder: {event_name} at {school_name} on {date} at {time}. We look forward to seeing you.', ARRAY['event_name', 'school_name', 'date', 'time']),
        ('Term Opening', 'Dear {parent_name}, {school_name} opens for {term} on {date}. Please ensure {student_name} reports by {time} with all requirements.', ARRAY['parent_name', 'school_name', 'term', 'date', 'student_name', 'time'])
) AS t(name, body, variables)
WHERE NOT EXISTS (
    SELECT 1 FROM sms_templates WHERE school_id = s.id AND is_default = true
);


-- ============================================
-- Migration: 00036_fix_pending_migrations.sql
-- ============================================

-- =============================================================================
-- Fix: Pending migrations that failed due to dependency issues
-- Applies all missing tables, enums, functions, and policies in correct order
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure set_updated_at function exists (some migrations reference it)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. discipline_incident_type enum (00019 used IF NOT EXISTS which is invalid)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE discipline_incident_type AS ENUM (
        'verbal_warning', 'written_warning', 'detention',
        'suspension', 'parent_called', 'referred_to_head', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. discount_type enum (00020 depends on this)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. calendar_events table (00018 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title       text NOT NULL,
    description text,
    event_date  date NOT NULL,
    end_date    date,
    event_type  text NOT NULL DEFAULT 'event'
                CHECK (event_type IN ('holiday', 'exam', 'event', 'closure', 'meeting')),
    affects_attendance boolean NOT NULL DEFAULT true,
    class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
    is_public   boolean NOT NULL DEFAULT true,
    created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_admin_manage_calendar" ON calendar_events FOR ALL
        USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_calendar" ON calendar_events FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(school_id, event_date)
    WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_calendar_events_class ON calendar_events(class_id)
    WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 5. discipline_records table (00019 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discipline_records (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    incident_date   date NOT NULL,
    incident_type   text NOT NULL,
    description     text NOT NULL,
    action_taken    text,
    recorded_by     uuid REFERENCES users(id),
    parent_notified boolean NOT NULL DEFAULT false,
    parent_notified_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE discipline_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_discipline" ON discipline_records FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_discipline" ON discipline_records FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_discipline_student ON discipline_records(student_id)
    WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 6. fee_discounts & student_discounts (00020 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_discounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    discount_type   discount_type NOT NULL DEFAULT 'percentage',
    value           numeric NOT NULL DEFAULT 0,
    max_amount      numeric,
    is_recurring    boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS student_discounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    discount_id     uuid NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
    term_id         uuid REFERENCES terms(id),
    approved_by     uuid REFERENCES users(id),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_discounts" ON fee_discounts FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_discounts" ON fee_discounts FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "school_manage_student_discounts" ON student_discounts FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_student_discounts" ON student_discounts FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7. meeting_slots & meeting_bookings (00022 — fix parent_students refs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_slots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    slot_date       date NOT NULL,
    start_time      time NOT NULL,
    end_time        time NOT NULL,
    duration_minutes int NOT NULL DEFAULT 15,
    is_booked       boolean NOT NULL DEFAULT false,
    is_deleted      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS meeting_bookings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id         uuid NOT NULL REFERENCES meeting_slots(id) ON DELETE CASCADE,
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    parent_name     text NOT NULL,
    parent_phone    text NOT NULL,
    notes           text,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    reminder_sent   boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meeting_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_bookings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_slots" ON meeting_slots FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_slots" ON meeting_slots FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "school_manage_bookings" ON meeting_bookings FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_bookings" ON meeting_bookings FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_meeting_slots_teacher_date ON meeting_slots(school_id, teacher_id, slot_date)
    WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_meeting_slots_available ON meeting_slots(school_id, slot_date, is_booked)
    WHERE is_deleted = false AND is_booked = false;
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_slot ON meeting_bookings(slot_id)
    WHERE status = 'confirmed';

-- Helper function
CREATE OR REPLACE FUNCTION generate_meeting_slots(
    p_school_id uuid,
    p_teacher_id uuid,
    p_slot_date date,
    p_start_time time,
    p_end_time time,
    p_duration_minutes int DEFAULT 15
) RETURNS void AS $$
DECLARE
    slot_start time;
    slot_end time;
BEGIN
    slot_start := p_start_time;
    LOOP
        slot_end := slot_start + (p_duration_minutes || ' minutes')::interval;
        EXIT WHEN slot_end > p_end_time;
        IF NOT EXISTS (
            SELECT 1 FROM meeting_slots
            WHERE school_id = p_school_id AND teacher_id = p_teacher_id
              AND slot_date = p_slot_date AND start_time = slot_start AND is_deleted = false
        ) THEN
            INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes)
            VALUES (p_school_id, p_teacher_id, p_slot_date, slot_start, slot_end, p_duration_minutes);
        END IF;
        slot_start := slot_end;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 8. GROUP_ADMIN role + school_groups + group_admins (00026 failed)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GROUP_ADMIN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS school_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

DO $$ BEGIN
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES school_groups(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS group_admins (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_school_groups" ON school_groups FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_group_admins" ON group_admins FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Helper function for group school IDs
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT s.id FROM schools s
    JOIN group_admins ga ON ga.group_id = s.group_id
    WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
$$;

-- Group admin RLS for schools
DO $$ BEGIN
    CREATE POLICY "group_admin_insert_schools" ON schools FOR INSERT
        WITH CHECK (
            get_user_role() = 'GROUP_ADMIN'
            AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_update_group_schools" ON schools FOR UPDATE
        USING (
            get_user_role() = 'GROUP_ADMIN'
            AND id IN (SELECT get_user_group_school_ids())
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Group admin read access
DO $$ BEGIN
    CREATE POLICY "group_admin_read_students" ON students FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_fee_accounts" ON fee_accounts FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_attendance" ON attendance_records FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_marks" ON marks FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_classes" ON classes FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_staff" ON staff FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "group_admin_read_subjects" ON subjects FOR SELECT
        USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Performance index for group_id
CREATE INDEX IF NOT EXISTS idx_schools_group ON schools(group_id) WHERE group_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. library_books & library_issues (00027 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS library_books (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title           text NOT NULL,
    author          text,
    isbn            text,
    category        text,
    total_copies    int NOT NULL DEFAULT 1,
    available_copies int NOT NULL DEFAULT 1,
    shelf_location  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS library_issues (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id         uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    due_date        date NOT NULL,
    returned_at     timestamptz,
    fine_amount     numeric,
    fine_paid       boolean NOT NULL DEFAULT false,
    issued_by       uuid REFERENCES users(id)
);

ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_library_books" ON library_books FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_library_books" ON library_books FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "school_manage_library_issues" ON library_issues FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_library_issues" ON library_issues FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_library_books_school ON library_books(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_library_issues_student ON library_issues(student_id);
CREATE INDEX IF NOT EXISTS idx_library_issues_book ON library_issues(book_id);

-- Updated at trigger for library_books
DO $$ BEGIN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_books
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 10. assets & asset_maintenance (00029 failed)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE asset_condition AS ENUM ('excellent', 'good', 'fair', 'poor', 'written_off');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS assets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    asset_code      text,
    category        text,
    purchase_date   date,
    purchase_price  numeric,
    current_value   numeric,
    condition       asset_condition NOT NULL DEFAULT 'good',
    location        text,
    assigned_to     uuid REFERENCES users(id),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS asset_maintenance (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id        uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    maintenance_date date NOT NULL,
    description     text NOT NULL,
    cost            numeric,
    next_service_date date,
    performed_by    text
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_assets" ON assets FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_assets" ON assets FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "school_manage_asset_maintenance" ON asset_maintenance FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_school ON assets(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON asset_maintenance(asset_id);

DO $$ BEGIN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 11. alumni table (00033 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alumni (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid REFERENCES students(id),
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    admission_number text,
    graduation_year int NOT NULL,
    last_class      text,
    current_school  text,
    phone           text,
    email           text,
    profession      text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE alumni ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_alumni" ON alumni FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_alumni" ON alumni FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_alumni_school ON alumni(school_id) WHERE is_deleted = false;

DO $$ BEGIN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON alumni
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 12. sms_templates table (00035 failed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    body            text NOT NULL,
    variables       text[] DEFAULT '{}',
    is_default      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "sms_templates_school_access" ON sms_templates FOR ALL
        USING (
            school_id IN (SELECT school_id FROM users WHERE id = auth.uid())
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_templates_school ON sms_templates(school_id) WHERE is_deleted = false;

DO $$ BEGIN
    CREATE TRIGGER set_sms_templates_updated_at BEFORE UPDATE ON sms_templates
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Attendance weekly summary view (00034 depends on calendar_events)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS attendance_weekly_summary CASCADE;
CREATE VIEW attendance_weekly_summary AS
WITH weekly AS (
    SELECT
        ar.school_id,
        c.id AS class_id,
        c.name AS class_name,
        date_trunc('week', ar.date)::date AS week_start,
        COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
        COUNT(*) FILTER (WHERE ar.status = 'absent') AS absent_count,
        COUNT(*) FILTER (WHERE ar.status = 'late') AS late_count,
        COUNT(*) FILTER (WHERE ar.status = 'excused') AS excused_count,
        COUNT(*) AS total_records
    FROM attendance_records ar
    JOIN classes c ON c.id = ar.class_id
    GROUP BY ar.school_id, c.id, c.name, date_trunc('week', ar.date)
)
SELECT
    w.*,
    (5 - COALESCE((
        SELECT COUNT(*)
        FROM calendar_events ce
        WHERE ce.school_id = w.school_id
          AND ce.event_type = 'holiday'
          AND ce.affects_attendance = true
          AND ce.is_deleted = false
          AND ce.event_date >= w.week_start
          AND ce.event_date < (w.week_start + interval '5 days')::date
    ), 0)) AS expected_school_days,
    ROUND(
        w.present_count * 100.0 / NULLIF(w.total_records, 0),
        1
    ) AS attendance_rate
FROM weekly w;

-- ---------------------------------------------------------------------------
-- 14. expense_payment_method enum (00021 may need it)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank', 'mobile_money', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure expense_categories and expenses tables exist
CREATE TABLE IF NOT EXISTS expense_categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    is_deleted      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS expenses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    category_id     uuid REFERENCES expense_categories(id),
    term_id         uuid REFERENCES terms(id),
    description     text NOT NULL,
    amount          numeric NOT NULL,
    expense_date    date NOT NULL,
    payment_method  text,
    receipt_number  text,
    recorded_by     uuid REFERENCES users(id),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "school_manage_expense_categories" ON expense_categories FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_expense_categories" ON expense_categories FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "school_manage_expenses" ON expenses FOR ALL
        USING (school_id = get_user_school_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "super_admin_all_expenses" ON expenses FOR ALL
        USING (get_user_role() = 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
