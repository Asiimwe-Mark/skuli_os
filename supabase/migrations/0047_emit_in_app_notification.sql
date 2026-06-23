-- =============================================================================
-- SKULI SaaS: Emit in-app notification (single RPC, dual-write)
-- Migration 0047 (refactor A-to-Z, Phase 6.4)
--
-- Every previous insert into in_app_notifications had to remember to also
-- write a parallel row to notification_logs (so the SMS / push delivery
-- audit stays complete). Some call sites forgot, producing a bell-icon
-- notification without a corresponding delivery log entry.
--
-- This RPC writes both rows in one statement. The handler just calls
--   SELECT emit_in_app_notification(...)
-- and gets the new in_app_notifications.id back. The dual-write
-- invariant is enforced server-side; the client cannot accidentally
-- skip the notification_logs row.
--
-- Why we still need notification_logs for IN_APP
-- -----------------------------------------------
-- notification_logs is the audit / analytics surface ("how many
-- notifications did school X send last week?", "what was the cost?",
-- "which delivery failed?"). Even though IN_APP doesn't have a
-- provider cost, it still needs a log entry so dashboards and
-- compliance reports can count notifications across all channels.
-- =============================================================================

CREATE OR REPLACE FUNCTION emit_in_app_notification(
    p_school_id       UUID,
    p_recipient_user_id UUID,
    p_title           TEXT,
    p_body            TEXT,
    p_type            TEXT DEFAULT 'info',
    p_entity_type     TEXT DEFAULT NULL,
    p_entity_id       UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id        UUID;
    v_now       TIMESTAMPTZ := now();
BEGIN
    -- Defence-in-depth: tenant scope check, same shape as the
    -- attendance batch function.
    IF NOT is_in_school(p_school_id) THEN
        RAISE EXCEPTION 'Caller is not a member of school %', p_school_id
            USING ERRCODE = '42501';
    END IF;

    -- Insert into the bell-icon inbox.
    INSERT INTO in_app_notifications (
        school_id, recipient_user_id, title, body, type,
        related_entity_type, related_entity_id, is_read
    ) VALUES (
        p_school_id, p_recipient_user_id, p_title, p_body, p_type,
        p_entity_type, p_entity_id, false
    )
    RETURNING id INTO v_id;

    -- Dual-write to notification_logs so the audit / analytics
    -- surface sees the IN_APP row. delivery_status is 'sent'
    -- because IN_APP has no upstream provider; sent_at is set
    -- immediately.
    INSERT INTO notification_logs (
        school_id, recipient_user_id, channel_type,
        message_body, delivery_status, related_entity_type,
        related_entity_id, sent_at, multi_sms_flag
    ) VALUES (
        p_school_id, p_recipient_user_id, 'IN_APP'::notification_channel,
        p_body, 'sent', p_entity_type, p_entity_id, v_now, false
    );

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_in_app_notification(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION emit_in_app_notification(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;