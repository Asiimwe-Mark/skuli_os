-- Migration: Performance indexes for common query patterns (Step 20)

-- Group analytics
CREATE INDEX IF NOT EXISTS idx_schools_group ON schools(group_id) WHERE group_id IS NOT NULL;

-- Library
CREATE INDEX IF NOT EXISTS idx_library_issues_student ON library_issues(school_id, student_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_library_issues_overdue ON library_issues(school_id, due_date) WHERE returned_at IS NULL;

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_term ON expenses(school_id, term_id, expense_date);

-- Message threads
CREATE INDEX IF NOT EXISTS idx_threads_phone ON message_threads(school_id, parent_phone);

-- Alumni
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni(school_id, graduation_year);

-- Assets
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(school_id, category) WHERE is_deleted = false;

-- Discipline
CREATE INDEX IF NOT EXISTS idx_discipline_student ON discipline_records(school_id, student_id) WHERE is_deleted = false;

-- Calendar
CREATE INDEX IF NOT EXISTS idx_calendar_term ON calendar_events(school_id, event_date, event_type) WHERE is_deleted = false;
