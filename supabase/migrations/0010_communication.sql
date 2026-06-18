-- =============================================================================
-- SKULI SaaS: Communication Tables
-- Migration 0010
--
-- message_threads, thread_messages, meeting_slots, meeting_bookings,
-- push_subscriptions, push_queue.
--
-- Dead columns removed (per reconciliation report section D):
--   * meeting_bookings.notes   — never selected
--   * library_issues.issued_by — never selected
--   * library_issues.updated_at — never selected
--
-- meeting_bookings.status: 'pending' added (00037) so a parent can book
-- and a teacher must confirm.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. message_threads (one per parent phone per school)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. thread_messages
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. meeting_slots (teacher availability)
-- ---------------------------------------------------------------------------
CREATE TABLE meeting_slots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    slot_date       date NOT NULL,
    start_time      time NOT NULL,
    end_time        time NOT NULL,
    duration_minutes int NOT NULL DEFAULT 15,
    -- GENERATED: ISO weekday derived from slot_date (1=Mon..7=Sun). Never insert.
    day_of_week     int GENERATED ALWAYS AS (EXTRACT(ISODOW FROM slot_date)::int) STORED,
    is_booked       boolean NOT NULL DEFAULT false,
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 4. meeting_bookings (parent reservations)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. push_subscriptions (PWA)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6. push_queue
--    Service-role only. anon/authenticated must have zero access.
--    Service role bypasses RLS entirely so no permissive policy is needed.
-- ---------------------------------------------------------------------------
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
