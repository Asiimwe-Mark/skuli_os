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
