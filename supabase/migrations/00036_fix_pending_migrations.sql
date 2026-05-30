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
    status          text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled', 'completed')),
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
