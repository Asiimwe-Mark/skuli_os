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
