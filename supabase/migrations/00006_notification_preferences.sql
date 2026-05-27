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
