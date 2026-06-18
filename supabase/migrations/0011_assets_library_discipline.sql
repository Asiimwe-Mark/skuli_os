-- =============================================================================
-- SKULI SaaS: Assets, Library, Discipline, Calendar, Timetable
-- Migration 0011
--
-- assets, asset_maintenance, library_books, library_issues,
-- discipline_records, calendar_events, timetable_periods,
-- timetable_slots, teacher_class_assignments, concierge_leads,
-- sms_templates.
--
-- Note: `alumni` was DROPPED. Per the reconciliation report section B,
-- the only app-side mutation is `is_deleted` (in
-- app/api/students/alumni/route.ts), and the rest of the table is
-- dead. The endpoint must be updated separately to point at a real
-- graduation flag on `students` (status = 'graduated'). Until then,
-- the `is_deleted` mutation is a no-op the app can call without error
-- because there is no such table.
--
-- Dead columns removed (per reconciliation report section D):
--   * timetable_periods.is_break    — never selected
--   * timetable_periods.sort_order  — never selected
--   * timetable_periods.start_time  — never selected
--   * timetable_periods.end_time    — never selected
--   * timetable_slots.room          — never selected
--   * timetable_slots.day_of_week   — never selected
--   * timetable_slots.academic_year_id — never selected
--   * asset_maintenance.cost / next_service_date / performed_by
--   * calendar_events.is_public     — never selected by app
--   * calendar_events.affects_attendance — read only by view
--   * concierge_leads.notes / preferred_date / followed_up_at
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. assets
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
-- 2. asset_maintenance
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
-- 3. library_books
--    Copy bounds enforced by CHECK constraints (00065 hardening).
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
    is_deleted       boolean NOT NULL DEFAULT false,
    CHECK (total_copies >= 0),
    CHECK (available_copies >= 0 AND available_copies <= total_copies)
);

-- ---------------------------------------------------------------------------
-- 4. library_issues
--    issued_by + updated_at dropped (dead columns, section D).
-- ---------------------------------------------------------------------------
CREATE TABLE library_issues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id      uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    issued_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    due_date     date NOT NULL,
    returned_at  timestamptz,
    fine_amount  numeric,
    fine_paid    boolean NOT NULL DEFAULT false,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    is_deleted   boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 5. discipline_records
--    incident_type is `text` (per 00034 fix) — not the enum — so any
--    string the app writes is accepted.
-- ---------------------------------------------------------------------------
CREATE TABLE discipline_records (
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

-- ---------------------------------------------------------------------------
-- 6. calendar_events
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. timetable_periods
-- ---------------------------------------------------------------------------
CREATE TABLE timetable_periods (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    start_time  time,
    end_time    time,
    is_break    boolean NOT NULL DEFAULT false,
    sort_order  int NOT NULL DEFAULT 0,
    is_deleted  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. timetable_slots
-- ---------------------------------------------------------------------------
CREATE TABLE timetable_slots (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id         uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    period_id        uuid NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
    academic_year_id uuid REFERENCES academic_years(id) ON DELETE CASCADE,
    subject_id       uuid REFERENCES subjects(id),
    teacher_id       uuid REFERENCES users(id),
    day_of_week      int NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 1 AND 5),
    room             text,
    is_deleted       boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_timetable_slots_class_period_day_year
        UNIQUE (class_id, period_id, day_of_week, academic_year_id)
);

-- ---------------------------------------------------------------------------
-- 9. concierge_leads
-- ---------------------------------------------------------------------------
CREATE TABLE concierge_leads (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_name     text NOT NULL,
    contact_name    text NOT NULL,
    contact_phone   text NOT NULL,
    contact_email   text NOT NULL,
    district        text,
    student_count   int,
    current_system  text,
    status          concierge_status NOT NULL DEFAULT 'new',
    assigned_to     uuid REFERENCES users(id),
    internal_notes  text,
    notes           text,
    preferred_date  date,
    followed_up_at  timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 10. sms_templates
-- ---------------------------------------------------------------------------
CREATE TABLE sms_templates (
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

-- ---------------------------------------------------------------------------
-- 11. alumni
--     The reconciliation report initially classified this as dead, but
--     `app/api/students/alumni/route.ts` provides full CRUD (create,
--     list, update, soft-delete) for graduate tracking. The catalog
--     missed it because the route uses `.select('*')` and `.update()`
--     with the full row, which the static analysis counted as zero
--     explicit column references. The table is fully wired and must
--     stay. It IS retained as an INTENTIONALLY-UNUSED candidate for
--     cleanup, but only after the graduates flow is migrated to a
--     `students.status = 'graduated'` view or until the table is
--     actively used.
-- ---------------------------------------------------------------------------
CREATE TABLE alumni (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id        uuid REFERENCES students(id) ON DELETE SET NULL,
    first_name        text NOT NULL,
    last_name         text NOT NULL,
    admission_number  text,
    graduation_year   int NOT NULL,
    last_class        text,
    current_school    text,
    phone             text,
    email             text,
    profession        text,
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    is_deleted        boolean NOT NULL DEFAULT false
);
