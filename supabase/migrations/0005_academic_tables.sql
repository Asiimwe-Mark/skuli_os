-- =============================================================================
-- SKULI SaaS: Academic Tables
-- Migration 0005
--
-- academic_years, terms, subjects, classes, class_subjects, students,
-- class_enrollments, teacher_class_assignments.
--
-- Dead columns removed (per reconciliation report section D):
--   * classes.stream   — never read by app
--   * students.parent_nid — never read
-- Dead columns retained (per section D):
--   * classes.capacity (00058) — app reads it
--   * students.date_of_birth / enrollment_date / exit_date — read
--
-- New columns added (per section C gap list):
--   * students.address  text
--   * students.motto    text
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. academic_years
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    level       text,
    is_current  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. terms
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
-- 3. subjects
--    color restored (optional timetable cell colour).
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    code        text,
    color       text,
    max_marks   int NOT NULL DEFAULT 100,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 4. classes
--    stream restored (used by class lists / timetable). Optional.
-- ---------------------------------------------------------------------------
CREATE TABLE classes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    level           text,
    stream          text,
    capacity        int,
    class_teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 5. class_subjects
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
-- 6. students
--    address + motto added (reconciliation report section C).
--    parent_nid dropped (dead column, section D).
-- ---------------------------------------------------------------------------
CREATE TABLE students (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    admission_number text NOT NULL,
    full_name       text NOT NULL,
    date_of_birth   date,
    gender          text,
    photo_url       text,
    address         text,
    motto           text,
    parent_nid      text,
    parent_name     text,
    parent_phone    text,
    parent_email    text,
    current_class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
    enrollment_date date,
    exit_date       date,
    status          student_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, admission_number)
);

-- ---------------------------------------------------------------------------
-- 7. class_enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE class_enrollments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
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
-- 8. teacher_class_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE teacher_class_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id      uuid REFERENCES subjects(id) ON DELETE CASCADE,
    is_class_teacher boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, teacher_id, class_id, subject_id)
);

-- ---------------------------------------------------------------------------
-- Deferred FK: parent_students.student_id → students(id)
-- (parent_students was created in 0004 before students existed)
-- ---------------------------------------------------------------------------
ALTER TABLE parent_students
    ADD CONSTRAINT parent_students_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
