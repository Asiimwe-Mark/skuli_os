-- =============================================================================
-- SKULI SaaS: Performance Indexes
-- Migration 00003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- school_id indexes (every table with school_id)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_academic_years_school_id ON academic_years(school_id);
CREATE INDEX idx_terms_school_id ON terms(school_id);
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_subjects_school_id ON subjects(school_id);
CREATE INDEX idx_class_subjects_school_id ON class_subjects(class_id);
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_class_enrollments_school_id ON class_enrollments(class_id);
CREATE INDEX idx_fee_structures_school_id ON fee_structures(school_id);
CREATE INDEX idx_fee_accounts_school_id ON fee_accounts(school_id);
CREATE INDEX idx_fee_payments_school_id ON fee_payments(school_id);
CREATE INDEX idx_marks_school_id ON marks(school_id);
CREATE INDEX idx_report_cards_school_id ON report_cards(school_id);
CREATE INDEX idx_attendance_records_school_id ON attendance_records(school_id);
CREATE INDEX idx_announcements_school_id ON announcements(school_id);
CREATE INDEX idx_sms_logs_school_id ON sms_logs(school_id);
CREATE INDEX idx_staff_school_id ON staff(school_id);
CREATE INDEX idx_payroll_records_school_id ON payroll_records(school_id);
CREATE INDEX idx_subscription_invoices_school_id ON subscription_invoices(school_id);
CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);

-- ---------------------------------------------------------------------------
-- student_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX idx_fee_accounts_student_id ON fee_accounts(student_id);
CREATE INDEX idx_fee_payments_student_id ON fee_payments(student_id);
CREATE INDEX idx_marks_student_id ON marks(student_id);
CREATE INDEX idx_report_cards_student_id ON report_cards(student_id);
CREATE INDEX idx_attendance_records_student_id ON attendance_records(student_id);

-- ---------------------------------------------------------------------------
-- term_id indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_terms_academic_year_id ON terms(academic_year_id);
CREATE INDEX idx_class_enrollments_term_id ON class_enrollments(term_id);
CREATE INDEX idx_fee_structures_term_id ON fee_structures(term_id);
CREATE INDEX idx_fee_accounts_term_id ON fee_accounts(term_id);
CREATE INDEX idx_marks_term_id ON marks(term_id);
CREATE INDEX idx_report_cards_term_id ON report_cards(term_id);

-- ---------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_classes_class_teacher_id ON classes(class_teacher_id);
CREATE INDEX idx_class_subjects_teacher_id ON class_subjects(teacher_id);
CREATE INDEX idx_class_subjects_subject_id ON class_subjects(subject_id);
CREATE INDEX idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX idx_class_enrollments_academic_year_id ON class_enrollments(academic_year_id);
CREATE INDEX idx_fee_structures_class_id ON fee_structures(class_id);
CREATE INDEX idx_fee_accounts_academic_year_id ON fee_accounts(academic_year_id);
CREATE INDEX idx_fee_payments_fee_account_id ON fee_payments(fee_account_id);
CREATE INDEX idx_fee_payments_received_by ON fee_payments(received_by_user_id);
CREATE INDEX idx_marks_subject_id ON marks(subject_id);
CREATE INDEX idx_marks_class_id ON marks(class_id);
CREATE INDEX idx_marks_academic_year_id ON marks(academic_year_id);
CREATE INDEX idx_marks_entered_by ON marks(entered_by);
CREATE INDEX idx_report_cards_academic_year_id ON report_cards(academic_year_id);
CREATE INDEX idx_attendance_records_class_id ON attendance_records(class_id);
CREATE INDEX idx_attendance_records_marked_by ON attendance_records(marked_by);
CREATE INDEX idx_announcements_sent_by ON announcements(sent_by);
CREATE INDEX idx_staff_user_id ON staff(user_id);
CREATE INDEX idx_payroll_records_staff_id ON payroll_records(staff_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- ---------------------------------------------------------------------------
-- Query-specific indexes
-- ---------------------------------------------------------------------------
-- Students
CREATE INDEX idx_students_admission_number ON students(admission_number);
CREATE INDEX idx_students_current_class_id ON students(current_class_id);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_parent_phone ON students(parent_phone);

-- Fee payments
CREATE INDEX idx_fee_payments_payment_date ON fee_payments(payment_date);
CREATE INDEX idx_fee_payments_receipt_number ON fee_payments(receipt_number);
CREATE INDEX idx_fee_payments_status ON fee_payments(status);

-- Fee accounts
CREATE INDEX idx_fee_accounts_status ON fee_accounts(status);

-- Attendance
CREATE INDEX idx_attendance_records_date ON attendance_records(date);
CREATE INDEX idx_attendance_records_status ON attendance_records(status);

-- Marks
CREATE INDEX idx_marks_exam_type ON marks(exam_type);

-- SMS logs
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_sent_at ON sms_logs(sent_at);

-- Announcements
CREATE INDEX idx_announcements_target_audience ON announcements(target_audience);
CREATE INDEX idx_announcements_sent_at ON announcements(sent_at);

-- Staff
CREATE INDEX idx_staff_is_active ON staff(is_active);

-- Payroll
CREATE INDEX idx_payroll_records_month_year ON payroll_records(month, year);
CREATE INDEX idx_payroll_records_payment_status ON payroll_records(payment_status);

-- Subscription invoices
CREATE INDEX idx_subscription_invoices_plan ON subscription_invoices(plan);
CREATE INDEX idx_subscription_invoices_status ON subscription_invoices(status);

-- Audit logs
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Academic structure
CREATE INDEX idx_academic_years_is_current ON academic_years(is_current);
CREATE INDEX idx_terms_is_current ON terms(is_current);
