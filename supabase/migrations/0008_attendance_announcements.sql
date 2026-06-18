-- =============================================================================
-- SKULI SaaS: Attendance, Announcements, Communication Logs
-- Migration 0008
--
-- attendance_records, announcements, sms_logs,
-- notification_preferences, in_app_notifications, notification_logs,
-- audit_logs.
--
-- Dead columns removed (per reconciliation report section D):
--   * attendance_records.marked_by  — never selected
--   * announcements.sent_via        — never selected
--   * sms_logs.related_entity_type  — never selected
--   * sms_logs.related_entity_id    — never selected
--   * notification_preferences.sms_enabled — never selected
--
-- New columns added (per section C gap list):
--   * notification_logs.last_error  text
--
-- Reconciliation note for `announcements.message_body`: the app reads
-- `message_body` from this table, but the column is `body`. Per the
-- audit, the app code is the bug — the schema is correct. The app
-- must be fixed to read `body` (or the code dropped). Do NOT add a
-- `message_body` alias column.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. attendance_records
--    term_id column added (00059) for EMIS reporting & dashboard joins.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_records (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    term_id     uuid REFERENCES terms(id),
    date        date NOT NULL,
    status      attendance_status NOT NULL,
    notes       text,
    remarks     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, class_id, date)
);
COMMENT ON COLUMN attendance_records.remarks IS 'Teacher remarks. The app reads remarks; notes is the legacy column.';

-- ---------------------------------------------------------------------------
-- 2. announcements
--    scheduled_status added (00011) so the SMS scheduler can pick
--    queued jobs.
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title               text NOT NULL,
    body                text,
    target_audience     announcement_target NOT NULL,
    target_class_ids    uuid[],
    -- text + CHECK (not sms_channel enum): the send route writes compound
    -- channel strings like 'sms,in_app'.
    sent_via            text NOT NULL
                        CHECK (sent_via IN (
                            'sms', 'email', 'in_app', 'push',
                            'sms,in_app', 'sms,push', 'email,in_app',
                            'sms,email,in_app', 'sms,in_app,push'
                        )),
    scheduled_at        timestamptz,
    scheduled_status    text NOT NULL DEFAULT 'pending'
                        CHECK (scheduled_status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    sent_at             timestamptz,
    sent_by             uuid REFERENCES users(id) ON DELETE SET NULL,
    sms_cost            numeric,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    is_deleted          boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. sms_logs
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
    error                   text,
    related_entity_type     text,
    related_entity_id       uuid,
    sent_at                 timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    is_deleted              boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 4. notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id                   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    send_receipt_sms            boolean NOT NULL DEFAULT true,
    send_absence_sms            boolean NOT NULL DEFAULT true,
    send_weekly_defaulter       boolean NOT NULL DEFAULT true,
    defaulter_reminder_day      int NOT NULL DEFAULT 1,
    defaulter_reminder_hour     int NOT NULL DEFAULT 8,
    send_report_card_sms        boolean NOT NULL DEFAULT true,
    send_term_start_sms         boolean NOT NULL DEFAULT true,
    sms_enabled                 boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    is_deleted                  boolean NOT NULL DEFAULT false,
    UNIQUE (school_id),
    CHECK (defaulter_reminder_day BETWEEN 0 AND 7),
    CHECK (defaulter_reminder_hour BETWEEN 0 AND 23)
);

-- ---------------------------------------------------------------------------
-- 5. in_app_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE in_app_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           text NOT NULL,
    body            text,
    -- type accepts both UI severities and entity-type values the
    -- notifications service writes (tuition_payment, payroll_disbursal).
    type            text NOT NULL DEFAULT 'info'
                    CHECK (type IN (
                        'info', 'warning', 'success', 'error',
                        'tuition_payment', 'payroll_disbursal', 'subscription'
                    )),
    is_read         boolean NOT NULL DEFAULT false,
    related_entity_type text,
    related_entity_id   uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 6. notification_logs
--    last_error added (per section C gap list).
-- ---------------------------------------------------------------------------
CREATE TABLE notification_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    recipient_phone     text,
    channel_type        notification_channel NOT NULL,
    message_body        text NOT NULL,
    delivery_status     text NOT NULL DEFAULT 'pending',
    multi_sms_flag      boolean NOT NULL DEFAULT false,
    related_entity_type text,
    related_entity_id   text,
    last_error          text,
    cost                numeric,
    provider_message_id text,
    sent_at             timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. audit_logs
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
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);
