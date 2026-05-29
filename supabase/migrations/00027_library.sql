-- =============================================================================
-- Library Management
-- Migration 00027
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. library_books
-- ---------------------------------------------------------------------------
CREATE TABLE library_books (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title            text NOT NULL,
    author           text,
    isbn             text,
    category         text,
    total_copies     int NOT NULL DEFAULT 1,
    available_copies int NOT NULL DEFAULT 1,
    shelf_location   text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    is_deleted       boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. library_issues
-- ---------------------------------------------------------------------------
CREATE TABLE library_issues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id      uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    due_date     date NOT NULL,
    returned_at  timestamptz,
    fine_amount  numeric,
    fine_paid    boolean NOT NULL DEFAULT false,
    issued_by    uuid REFERENCES users(id),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_issues ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. RLS Policies: library_books
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_library_books" ON library_books FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 5. RLS Policies: library_issues
-- ---------------------------------------------------------------------------
CREATE POLICY "school_manage_library_issues" ON library_issues FOR ALL
    USING (school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_books
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON library_issues
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_library_books_school ON library_books(school_id) WHERE is_deleted = false;
CREATE INDEX idx_library_books_isbn ON library_books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX idx_library_issues_school ON library_issues(school_id);
CREATE INDEX idx_library_issues_book ON library_issues(book_id);
CREATE INDEX idx_library_issues_student ON library_issues(student_id);
CREATE INDEX idx_library_issues_due ON library_issues(due_date) WHERE returned_at IS NULL;
