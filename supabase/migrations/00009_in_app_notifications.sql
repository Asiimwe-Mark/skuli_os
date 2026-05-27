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
