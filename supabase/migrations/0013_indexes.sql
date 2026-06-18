-- =============================================================================
-- SKULI SaaS: Indexes
-- Migration 0013
--
-- Single source of truth for every CREATE INDEX in the schema.
-- Union of 00003 + 00015 + 00030 + 00034 + 00059. Every index that
-- appears in any of those source files is created here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- school_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_school_id              ON users(school_id);
CREATE INDEX idx_academic_years_school_id     ON academic_years(school_id);
CREATE INDEX idx_terms_school_id              ON terms(school_id);
CREATE INDEX idx_classes_school_id            ON classes(school_id);
CREATE INDEX idx_subjects_school_id           ON subjects(school_id);
CREATE INDEX idx_students_school_id           ON students(school_id);
CREATE INDEX idx_fee_structures_school_id     ON fee_structures(school_id);
CREATE INDEX idx_fee_accounts_school_id       ON fee_accounts(school_id);
CREATE INDEX idx_fee_payments_school_id       ON fee_payments(school_id);
CREATE INDEX idx_marks_school_id              ON marks(school_id);
CREATE INDEX idx_report_cards_school_id       ON report_cards(school_id);
CREATE INDEX idx_attendance_records_school_id ON attendance_records(school_id);
CREATE INDEX idx_announcements_school_id      ON announcements(school_id);
CREATE INDEX idx_sms_logs_school_id           ON sms_logs(school_id);
CREATE INDEX idx_staff_school_id              ON staff(school_id);
CREATE INDEX idx_payroll_records_school_id    ON payroll_records(school_id);
CREATE INDEX idx_subscription_invoices_school_id ON subscription_invoices(school_id);
CREATE INDEX idx_audit_logs_school_id         ON audit_logs(school_id);
CREATE INDEX idx_schools_group                ON schools(group_id) WHERE group_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- student_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX idx_fee_accounts_student_id       ON fee_accounts(student_id);
CREATE INDEX idx_fee_payments_student_id       ON fee_payments(student_id);
CREATE INDEX idx_marks_student_id              ON marks(student_id);
CREATE INDEX idx_report_cards_student_id       ON report_cards(student_id);
CREATE INDEX idx_attendance_records_student_id ON attendance_records(student_id);

-- ---------------------------------------------------------------------------
-- term_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_terms_academic_year_id        ON terms(academic_year_id);
CREATE INDEX idx_class_enrollments_term_id     ON class_enrollments(term_id);
CREATE INDEX idx_fee_structures_term_id        ON fee_structures(term_id);
CREATE INDEX idx_fee_accounts_term_id          ON fee_accounts(term_id);
CREATE INDEX idx_fee_payments_term_id          ON fee_payments(term_id);
CREATE INDEX idx_marks_term_id                 ON marks(term_id);
CREATE INDEX idx_report_cards_term_id          ON report_cards(term_id);

-- ---------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_classes_class_teacher_id      ON classes(class_teacher_id);
CREATE INDEX idx_class_subjects_teacher_id     ON class_subjects(teacher_id);
CREATE INDEX idx_class_subjects_subject_id     ON class_subjects(subject_id);
CREATE INDEX idx_class_subjects_class_id       ON class_subjects(class_id);
CREATE INDEX idx_class_enrollments_class_id    ON class_enrollments(class_id);
CREATE INDEX idx_class_enrollments_academic_year_id ON class_enrollments(academic_year_id);
CREATE INDEX idx_fee_structures_class_id       ON fee_structures(class_id);
CREATE INDEX idx_fee_accounts_academic_year_id ON fee_accounts(academic_year_id);
CREATE INDEX idx_fee_payments_fee_account_id   ON fee_payments(fee_account_id);
CREATE INDEX idx_marks_subject_id              ON marks(subject_id);
CREATE INDEX idx_marks_class_id                ON marks(class_id);
CREATE INDEX idx_marks_academic_year_id        ON marks(academic_year_id);
CREATE INDEX idx_report_cards_academic_year_id ON report_cards(academic_year_id);
CREATE INDEX idx_attendance_records_class_id   ON attendance_records(class_id);
CREATE INDEX idx_announcements_sent_by         ON announcements(sent_by);
CREATE INDEX idx_staff_user_id                 ON staff(user_id);
CREATE INDEX idx_payroll_records_staff_id      ON payroll_records(staff_id);
CREATE INDEX idx_audit_logs_user_id            ON audit_logs(user_id);
CREATE INDEX idx_users_email                   ON users(email) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Query-specific indexes — students
-- ---------------------------------------------------------------------------
CREATE INDEX idx_students_admission_number    ON students(admission_number);
CREATE INDEX idx_students_current_class_id     ON students(current_class_id);
CREATE INDEX idx_students_status               ON students(status);
CREATE INDEX idx_students_parent_phone         ON students(parent_phone);
CREATE INDEX idx_students_parent_phone_active  ON students(parent_phone) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Fee payments / accounts
-- ---------------------------------------------------------------------------
CREATE INDEX idx_fee_payments_payment_date     ON fee_payments(school_id, payment_date, status);
CREATE INDEX idx_fee_payments_receipt_number   ON fee_payments(receipt_number);
CREATE INDEX idx_fee_payments_status           ON fee_payments(status);
CREATE UNIQUE INDEX uq_fee_payments_receipt_number
    ON fee_payments(receipt_number) WHERE receipt_number IS NOT NULL AND is_deleted = false;
CREATE INDEX idx_fee_accounts_status           ON fee_accounts(status);
CREATE INDEX idx_fee_types_school              ON fee_types(school_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Attendance / marks
-- ---------------------------------------------------------------------------
CREATE INDEX idx_attendance_records_date       ON attendance_records(date);
CREATE INDEX idx_attendance_records_status     ON attendance_records(status);
CREATE INDEX idx_attendance_records_school_date_status
    ON attendance_records(school_id, date, status);
CREATE INDEX idx_marks_exam_type               ON marks(exam_type);
CREATE INDEX idx_marks_review_status
    ON marks(school_id, class_id, term_id, review_status) WHERE is_deleted = false;
CREATE INDEX idx_marks_class_term_subject
    ON marks(school_id, class_id, term_id, subject_id);

-- ---------------------------------------------------------------------------
-- SMS / announcements
-- ---------------------------------------------------------------------------
CREATE INDEX idx_sms_logs_status               ON sms_logs(status);
CREATE INDEX idx_sms_logs_sent_at              ON sms_logs(sent_at);
CREATE INDEX idx_sms_logs_school_status_sent_at
    ON sms_logs(school_id, status, sent_at) WHERE is_deleted = false;
CREATE INDEX idx_sms_logs_status_date          ON sms_logs(school_id, status, sent_at);
CREATE INDEX idx_announcements_target_audience ON announcements(target_audience);
CREATE INDEX idx_announcements_sent_at         ON announcements(sent_at);
CREATE INDEX idx_announcements_scheduled
    ON announcements(scheduled_at, scheduled_status)
    WHERE scheduled_at IS NOT NULL AND scheduled_status = 'pending';

-- ---------------------------------------------------------------------------
-- Staff / payroll
-- ---------------------------------------------------------------------------
CREATE INDEX idx_staff_is_active               ON staff(is_active);
CREATE INDEX idx_payroll_records_month_year    ON payroll_records(month, year);
CREATE INDEX idx_payroll_records_payment_status ON payroll_records(payment_status);
CREATE INDEX idx_payroll_batches_school        ON payroll_batches(school_id);
CREATE INDEX idx_payroll_batches_funding       ON payroll_batches(id);
CREATE INDEX idx_batch_line_items_batch        ON batch_line_items(batch_id);
CREATE INDEX idx_batch_line_items_status       ON batch_line_items(disbursal_status);
CREATE INDEX idx_staff_payment_profiles_school ON staff_payment_profiles(school_id);

-- ---------------------------------------------------------------------------
-- Subscription / audit
-- ---------------------------------------------------------------------------
CREATE INDEX idx_subscription_invoices_plan    ON subscription_invoices(plan);
CREATE INDEX idx_subscription_invoices_status  ON subscription_invoices(status);
CREATE INDEX idx_audit_logs_entity_type        ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id          ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at         ON audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
CREATE INDEX idx_academic_years_is_current     ON academic_years(is_current);
CREATE INDEX idx_terms_is_current              ON terms(is_current);

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------
CREATE INDEX idx_library_books_school          ON library_books(school_id) WHERE is_deleted = false;
CREATE INDEX idx_library_books_isbn            ON library_books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX idx_library_issues_school         ON library_issues(school_id);
CREATE INDEX idx_library_issues_book           ON library_issues(book_id);
CREATE INDEX idx_library_issues_student        ON library_issues(student_id);
CREATE INDEX idx_library_issues_due            ON library_issues(due_date) WHERE returned_at IS NULL;
CREATE INDEX idx_library_issues_student_returned
    ON library_issues(school_id, student_id, returned_at);
CREATE INDEX idx_library_issues_overdue
    ON library_issues(school_id, due_date) WHERE returned_at IS NULL;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
CREATE INDEX idx_expenses_date                  ON expenses(school_id, expense_date) WHERE is_deleted = false;
CREATE INDEX idx_expenses_term                 ON expenses(school_id, term_id, expense_date);

-- ---------------------------------------------------------------------------
-- Message threads
-- ---------------------------------------------------------------------------
CREATE INDEX idx_threads_last_msg              ON message_threads(school_id, last_message_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_threads_phone                 ON message_threads(school_id, parent_phone);
CREATE INDEX idx_thread_messages_thread        ON thread_messages(thread_id, sent_at) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
CREATE INDEX idx_assets_school                 ON assets(school_id) WHERE is_deleted = false;
CREATE INDEX idx_assets_category               ON assets(school_id, category) WHERE is_deleted = false;
CREATE INDEX idx_assets_code                   ON assets(asset_code) WHERE asset_code IS NOT NULL;
CREATE INDEX idx_asset_maintenance_asset       ON asset_maintenance(asset_id);
CREATE INDEX idx_asset_maintenance_school      ON asset_maintenance(school_id);

-- ---------------------------------------------------------------------------
-- Discipline / calendar / timetable
-- ---------------------------------------------------------------------------
CREATE INDEX idx_discipline_student            ON discipline_records(school_id, student_id, incident_date DESC) WHERE is_deleted = false;
CREATE INDEX idx_calendar_events_date          ON calendar_events(school_id, event_date) WHERE is_deleted = false;
CREATE INDEX idx_calendar_events_class         ON calendar_events(class_id) WHERE is_deleted = false;
CREATE INDEX idx_calendar_term                 ON calendar_events(school_id, event_date, event_type) WHERE is_deleted = false;
CREATE INDEX idx_timetable_periods_school      ON timetable_periods(school_id, is_deleted);
CREATE INDEX idx_timetable_slots_class         ON timetable_slots(class_id) WHERE is_deleted = false;
CREATE INDEX idx_timetable_slots_teacher       ON timetable_slots(teacher_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------
CREATE INDEX idx_meeting_slots_teacher_date    ON meeting_slots(school_id, teacher_id, slot_date) WHERE is_deleted = false;
CREATE INDEX idx_meeting_slots_available       ON meeting_slots(school_id, slot_date, is_booked) WHERE is_deleted = false AND is_booked = false;
CREATE INDEX idx_meeting_bookings_slot         ON meeting_bookings(slot_id) WHERE status = 'confirmed';
CREATE INDEX idx_meeting_bookings_reminder     ON meeting_bookings(school_id, reminder_sent, status) WHERE status = 'confirmed' AND reminder_sent = false;

-- ---------------------------------------------------------------------------
-- Fee discounts
-- ---------------------------------------------------------------------------
CREATE INDEX idx_fee_discounts_school          ON fee_discounts(school_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_school      ON student_discounts(school_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_student     ON student_discounts(student_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_discount    ON student_discounts(discount_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_term        ON student_discounts(term_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX uq_student_discounts_with_term
    ON student_discounts(student_id, discount_id, term_id)
    WHERE term_id IS NOT NULL AND is_deleted = false;
CREATE UNIQUE INDEX uq_student_discounts_no_term
    ON student_discounts(student_id, discount_id)
    WHERE term_id IS NULL AND is_deleted = false;

-- ---------------------------------------------------------------------------
-- Tuition / notifications / emis / subject_comments
-- ---------------------------------------------------------------------------
CREATE INDEX idx_tuition_payments_school       ON tuition_payments(school_id);
CREATE INDEX idx_tuition_payments_student      ON tuition_payments(student_id);
CREATE INDEX idx_tuition_payments_status       ON tuition_payments(status);
CREATE INDEX idx_tuition_payments_tracking     ON tuition_payments(pesapal_order_tracking_id);
CREATE INDEX idx_notification_logs_school      ON notification_logs(school_id);
CREATE INDEX idx_notification_logs_entity      ON notification_logs(related_entity_type, related_entity_id);
CREATE INDEX idx_emis_logs_school              ON emis_report_logs(school_id);
CREATE INDEX idx_subject_comments_student_term ON subject_comments(student_id, term_id);
CREATE INDEX idx_subject_comments_school       ON subject_comments(school_id);

-- ---------------------------------------------------------------------------
-- Referrals / notifications / push
-- ---------------------------------------------------------------------------
CREATE INDEX idx_referral_codes_school         ON referral_codes(owner_school_id);
CREATE INDEX idx_referrals_code                ON referrals(referral_code_id);
CREATE INDEX idx_notifications_user_unread
    ON in_app_notifications(recipient_user_id, is_read, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_teacher_class_assignments_teacher
    ON teacher_class_assignments(teacher_id, school_id, is_deleted) WHERE is_deleted = false;
CREATE INDEX idx_teacher_class_assignments_class
    ON teacher_class_assignments(class_id, school_id, is_deleted) WHERE is_deleted = false;
CREATE INDEX idx_push_queue_pending            ON push_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_sms_templates_school          ON sms_templates(school_id) WHERE is_deleted = false;
CREATE INDEX idx_marketplace_category          ON marketplace_templates(category) WHERE is_deleted = false;
CREATE INDEX idx_marketplace_featured          ON marketplace_templates(is_featured) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Reconciliation indexes (folded in from former 0031/0032 patches)
-- ---------------------------------------------------------------------------
-- class_enrollments tenant scope
CREATE INDEX idx_class_enrollments_school_id   ON class_enrollments(school_id);
CREATE INDEX idx_class_enrollments_school_term ON class_enrollments(school_id, term_id) WHERE is_deleted = false;

-- fee_payments restored columns
CREATE INDEX idx_fee_payments_received_by      ON fee_payments(received_by_user_id) WHERE received_by_user_id IS NOT NULL;
CREATE INDEX idx_fee_payments_pesapal_tracking ON fee_payments(pesapal_order_tracking_id) WHERE pesapal_order_tracking_id IS NOT NULL;
CREATE INDEX idx_fee_payments_mobile_provider  ON fee_payments(school_id, mobile_money_provider, status) WHERE is_deleted = false AND mobile_money_provider IS NOT NULL;
CREATE INDEX idx_fee_payments_term_school_status ON fee_payments(school_id, term_id, status) WHERE is_deleted = false AND term_id IS NOT NULL;

-- fee_accounts / fee_discounts
CREATE INDEX idx_fee_accounts_school_term_status ON fee_accounts(school_id, term_id, status) WHERE is_deleted = false;
CREATE INDEX idx_fee_discounts_school_active    ON fee_discounts(school_id, is_active) WHERE is_deleted = false;

-- expenses restored columns
CREATE INDEX idx_expenses_recorded_by          ON expenses(recorded_by) WHERE recorded_by IS NOT NULL;
CREATE INDEX idx_expenses_term_school          ON expenses(school_id, term_id) WHERE is_deleted = false AND term_id IS NOT NULL;

-- marks.grade
CREATE INDEX idx_marks_grade                   ON marks(school_id, term_id, grade) WHERE is_deleted = false;

-- schools active / billing
CREATE INDEX idx_schools_active                ON schools(id) WHERE is_deleted = false;
CREATE INDEX idx_schools_next_billing_date     ON schools(next_billing_date) WHERE is_deleted = false AND subscription_status = 'active';

-- calendar portal
CREATE INDEX idx_calendar_events_public_portal ON calendar_events(school_id, event_date, is_public) WHERE is_deleted = false AND is_public = true;

-- timetable day/year
CREATE INDEX idx_timetable_slots_class_day     ON timetable_slots(class_id, day_of_week) WHERE is_deleted = false;
CREATE INDEX idx_timetable_slots_teacher_day   ON timetable_slots(teacher_id, day_of_week) WHERE is_deleted = false AND teacher_id IS NOT NULL;
CREATE INDEX idx_timetable_slots_academic_year ON timetable_slots(school_id, academic_year_id) WHERE is_deleted = false;
CREATE INDEX idx_timetable_periods_school_order ON timetable_periods(school_id, sort_order) WHERE is_deleted = false;

-- meeting / library / subject_comments / sms / staff payroll
CREATE INDEX idx_meeting_slots_teacher_day     ON meeting_slots(teacher_id, day_of_week) WHERE is_deleted = false AND is_booked = false;
CREATE INDEX idx_library_issues_overdue_calc   ON library_issues(school_id, due_date) WHERE returned_at IS NULL AND is_deleted = false;
CREATE INDEX idx_subject_comments_student_term_active ON subject_comments(student_id, term_id) WHERE is_deleted = false;
CREATE INDEX idx_sms_logs_related_entity       ON sms_logs(related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX idx_staff_payment_profiles_staff_id ON staff_payment_profiles(staff_id);
CREATE INDEX idx_payroll_records_school_period_status ON payroll_records(school_id, year, month, payment_status) WHERE is_deleted = false;
CREATE INDEX idx_push_subscriptions_user       ON push_subscriptions(user_id) WHERE is_deleted = false;
CREATE INDEX idx_meeting_bookings_school_status ON meeting_bookings(school_id, status);
CREATE INDEX idx_audit_logs_school_created     ON audit_logs(school_id, created_at DESC);
CREATE INDEX idx_discipline_parent_notified    ON discipline_records(school_id, parent_notified, incident_date DESC) WHERE is_deleted = false AND parent_notified = false;
