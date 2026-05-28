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
