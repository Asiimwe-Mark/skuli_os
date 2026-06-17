-- =============================================================================
-- SKULI SaaS: Grading Tables
-- Migration 0007
--
-- marks, report_cards, subject_comments, grading_scales.
--
-- Dead columns removed (per reconciliation report section D):
--   * marks.entered_by     — never selected
--   * marks.reviewed_by    — never selected
--   * report_cards.pdf_url — app writes it but never reads it back
--   * subject_comments.created_at / updated_at / is_deleted — never selected
--
-- Retained (per section D):
--   * report_cards.class_id (00051) — referenced by app
--   * marks.review_status / review_comment / reviewed_at (00007) — used
--     for the approval workflow and by subject_performance_summary view
--   * grading_scales.sort_order — needed for default seed ordering
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. marks
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
    remarks         text,
    review_status   text NOT NULL DEFAULT 'not_started'
                    CHECK (review_status IN ('not_started', 'draft', 'submitted', 'approved', 'rejected')),
    review_comment  text,
    reviewed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, subject_id, term_id, exam_type)
);

-- ---------------------------------------------------------------------------
-- 2. report_cards
-- ---------------------------------------------------------------------------
CREATE TABLE report_cards (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id             uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id            uuid REFERENCES classes(id),
    total_marks         numeric,
    average             numeric,
    position_in_class   int,
    class_size          int,
    class_teacher_comment text,
    headmaster_comment  text,
    conduct_grade       conduct_grade,
    is_published        boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    is_deleted          boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. subject_comments
-- ---------------------------------------------------------------------------
CREATE TABLE subject_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id     uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    subject_id  uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    bot_comment text,
    mid_comment text,
    eot_comment text
);

-- ---------------------------------------------------------------------------
-- 4. grading_scales
-- ---------------------------------------------------------------------------
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
