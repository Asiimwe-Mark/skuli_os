-- =============================================================================
-- SKULI SaaS: RLS Policies — Attendance / Announcements / Staff / Payroll /
--                                            Communication
-- Migration 0016
--
-- attendance_records, announcements, sms_logs, staff, payroll_records,
-- staff_payment_profiles, payroll_batches, batch_line_items,
-- meeting_slots, meeting_bookings, message_threads, thread_messages,
-- push_subscriptions, notification_preferences, in_app_notifications.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- attendance_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_attendance       ON attendance_records;
DROP POLICY IF EXISTS school_admin_bursar_attendance   ON attendance_records;
DROP POLICY IF EXISTS teacher_manage_attendance        ON attendance_records;
DROP POLICY IF EXISTS teacher_write_own_attendance     ON attendance_records;
DROP POLICY IF EXISTS teacher_update_own_attendance    ON attendance_records;
DROP POLICY IF EXISTS parent_own_attendance            ON attendance_records;

CREATE POLICY super_admin_all_attendance ON attendance_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_attendance ON attendance_records FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_manage_attendance ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false)
            OR class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false)
        )
    );

CREATE POLICY teacher_write_own_attendance ON attendance_records FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND EXISTS (
            SELECT 1 FROM teacher_class_assignments tca
            WHERE tca.teacher_id = auth.uid()
              AND tca.class_id = attendance_records.class_id
              AND tca.is_class_teacher = true
              AND tca.is_deleted = false
        )
    );

CREATE POLICY teacher_update_own_attendance ON attendance_records FOR UPDATE
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND EXISTS (
            SELECT 1 FROM teacher_class_assignments tca
            WHERE tca.teacher_id = auth.uid()
              AND tca.class_id = attendance_records.class_id
              AND tca.is_class_teacher = true
              AND tca.is_deleted = false
        )
    );

CREATE POLICY parent_own_attendance ON attendance_records FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_announcements   ON announcements;
DROP POLICY IF EXISTS school_admin_manage_announcements ON announcements;
DROP POLICY IF EXISTS teacher_see_announcements        ON announcements;
DROP POLICY IF EXISTS parent_see_announcements         ON announcements;

CREATE POLICY super_admin_all_announcements ON announcements FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_manage_announcements ON announcements FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_see_announcements ON announcements FOR SELECT
    USING (school_id = get_user_school_id() AND get_user_role() = 'TEACHER');

CREATE POLICY parent_see_announcements ON announcements FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND (
            target_audience = 'all'
            OR target_class_ids && (
                SELECT array_agg(s.current_class_id) FROM students s
                WHERE s.id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
            )
        )
    );

-- ---------------------------------------------------------------------------
-- sms_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_sms_logs   ON sms_logs;
DROP POLICY IF EXISTS school_admin_bursar_sms_logs ON sms_logs;

CREATE POLICY super_admin_all_sms_logs ON sms_logs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_sms_logs ON sms_logs FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_staff   ON staff;
DROP POLICY IF EXISTS school_admin_bursar_staff ON staff;
DROP POLICY IF EXISTS staff_see_own_record     ON staff;

CREATE POLICY super_admin_all_staff ON staff FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_staff ON staff FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY staff_see_own_record ON staff FOR SELECT
    USING (user_id = auth.uid() AND school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- payroll_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_payroll   ON payroll_records;
DROP POLICY IF EXISTS school_admin_bursar_payroll ON payroll_records;

CREATE POLICY super_admin_all_payroll ON payroll_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_payroll ON payroll_records FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- ---------------------------------------------------------------------------
-- staff_payment_profiles (per 00055 — self-only for non-admins)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_payment_profiles_select ON staff_payment_profiles;
DROP POLICY IF EXISTS staff_payment_profiles_write  ON staff_payment_profiles;

CREATE POLICY staff_payment_profiles_select ON staff_payment_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.role IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN')
              AND u.school_id = staff_payment_profiles.school_id
        )
        OR EXISTS (
            SELECT 1 FROM staff s
            WHERE s.id = staff_payment_profiles.staff_id
              AND s.user_id = auth.uid()
        )
    );

CREATE POLICY staff_payment_profiles_write ON staff_payment_profiles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.role IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN')
              AND u.school_id = staff_payment_profiles.school_id
        )
        OR EXISTS (
            SELECT 1 FROM staff s
            WHERE s.id = staff_payment_profiles.staff_id
              AND s.user_id = auth.uid()
              AND s.school_id = staff_payment_profiles.school_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.role IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN')
              AND u.school_id = staff_payment_profiles.school_id
        )
        OR EXISTS (
            SELECT 1 FROM staff s
            WHERE s.id = staff_payment_profiles.staff_id
              AND s.user_id = auth.uid()
              AND s.school_id = staff_payment_profiles.school_id
        )
    );

-- ---------------------------------------------------------------------------
-- payroll_batches / batch_line_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payroll_batches_select  ON payroll_batches;
DROP POLICY IF EXISTS batch_line_items_select ON batch_line_items;

CREATE POLICY payroll_batches_select ON payroll_batches FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY batch_line_items_select ON batch_line_items FOR SELECT
    USING (batch_id IN (SELECT id FROM payroll_batches WHERE school_id = get_user_school_id()));

-- ---------------------------------------------------------------------------
-- meeting_slots / meeting_bookings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_slots         ON meeting_slots;
DROP POLICY IF EXISTS super_admin_all_slots       ON meeting_slots;
DROP POLICY IF EXISTS school_manage_bookings      ON meeting_bookings;
DROP POLICY IF EXISTS super_admin_all_bookings    ON meeting_bookings;
DROP POLICY IF EXISTS portal_view_bookings        ON meeting_bookings;
DROP POLICY IF EXISTS portal_insert_bookings      ON meeting_bookings;
DROP POLICY IF EXISTS portal_update_bookings      ON meeting_bookings;

CREATE POLICY school_manage_slots ON meeting_slots FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_slots ON meeting_slots FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_bookings ON meeting_bookings FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_bookings ON meeting_bookings FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY portal_view_bookings ON meeting_bookings FOR SELECT
    USING (student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid()));

CREATE POLICY portal_insert_bookings ON meeting_bookings FOR INSERT
    WITH CHECK (student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid()));

CREATE POLICY portal_update_bookings ON meeting_bookings FOR UPDATE
    USING (student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- message_threads / thread_messages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_threads   ON message_threads;
DROP POLICY IF EXISTS school_manage_thread_msgs ON thread_messages;

CREATE POLICY school_manage_threads ON message_threads FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY school_manage_thread_msgs ON thread_messages FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_own_push_subscriptions     ON push_subscriptions;
DROP POLICY IF EXISTS school_admin_view_push_subscriptions ON push_subscriptions;
DROP POLICY IF EXISTS super_admin_push_subscriptions   ON push_subscriptions;

CREATE POLICY users_own_push_subscriptions ON push_subscriptions FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY school_admin_view_push_subscriptions ON push_subscriptions FOR SELECT
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'));

CREATE POLICY super_admin_push_subscriptions ON push_subscriptions FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- notification_preferences / in_app_notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_manage_notif_prefs  ON notification_preferences;
DROP POLICY IF EXISTS super_admin_notif_prefs          ON notification_preferences;
DROP POLICY IF EXISTS users_read_own_notifications     ON in_app_notifications;
DROP POLICY IF EXISTS users_update_own_notifications   ON in_app_notifications;
DROP POLICY IF EXISTS school_admin_insert_notifications ON in_app_notifications;

CREATE POLICY school_admin_manage_notif_prefs ON notification_preferences FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY super_admin_notif_prefs ON notification_preferences FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY users_read_own_notifications ON in_app_notifications FOR SELECT
    USING (recipient_user_id = auth.uid());

CREATE POLICY users_update_own_notifications ON in_app_notifications FOR UPDATE
    USING (recipient_user_id = auth.uid());

CREATE POLICY school_admin_insert_notifications ON in_app_notifications FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- subscription_invoices
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_subscription_invoices ON subscription_invoices;
DROP POLICY IF EXISTS school_admin_subscription_invoices    ON subscription_invoices;

CREATE POLICY super_admin_all_subscription_invoices ON subscription_invoices FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_subscription_invoices ON subscription_invoices FOR SELECT
    USING (school_id = get_user_school_id() AND get_user_role() = 'SCHOOL_ADMIN');

-- ---------------------------------------------------------------------------
-- platform_settings — super admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_platform_settings ON platform_settings;
CREATE POLICY super_admin_all_platform_settings ON platform_settings FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- country_configs — public read; super admin writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS public_read_country_configs      ON country_configs;
DROP POLICY IF EXISTS super_admin_manage_country_configs ON country_configs;

CREATE POLICY public_read_country_configs ON country_configs FOR SELECT
    USING (true);

CREATE POLICY super_admin_manage_country_configs ON country_configs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- tuition_payments — same-school visibility (service role bypasses RLS for writes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tuition_payments_select ON tuition_payments;
CREATE POLICY tuition_payments_select ON tuition_payments FOR SELECT
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- marketplace_templates — public read; super admin writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS public_read_marketplace   ON marketplace_templates;
DROP POLICY IF EXISTS super_admin_manage_marketplace ON marketplace_templates;

CREATE POLICY public_read_marketplace ON marketplace_templates FOR SELECT
    USING (is_deleted = false);

CREATE POLICY super_admin_manage_marketplace ON marketplace_templates FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');
