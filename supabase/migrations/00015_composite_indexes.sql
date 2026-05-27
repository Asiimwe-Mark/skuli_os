-- Composite and partial indexes for performance optimization

-- Payment date index for financial reports (composite)
CREATE INDEX IF NOT EXISTS idx_fee_payments_date
    ON fee_payments(school_id, payment_date, status);

-- Parent phone for portal login (partial — only non-deleted students)
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_active
    ON students(parent_phone)
    WHERE is_deleted = false;

-- Marks review status (composite — class+term+subject for marks sheet queries)
CREATE INDEX IF NOT EXISTS idx_marks_class_term_subject
    ON marks(school_id, class_id, term_id, subject_id);

-- SMS delivery queries (composite)
CREATE INDEX IF NOT EXISTS idx_sms_logs_status_date
    ON sms_logs(school_id, status, sent_at);
