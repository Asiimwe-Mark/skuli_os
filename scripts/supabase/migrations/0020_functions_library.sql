-- =============================================================================
-- SKULI SaaS: Library Functions
-- Migration 0020
--
-- Atomic issue/return with row-level locking. Per 00062. The
-- decrement_available_copies / increment_available_copies helpers from
-- 00038 are NOT recreated — they were superseded by these atomic
-- functions and are a footgun if anyone calls them directly.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. issue_library_book
--    Validates the book exists, has copies available, the student
--    belongs to the school, then decrements + inserts in one
--    transaction guarded by a row lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_library_book(
    p_school_id    UUID,
    p_book_id      UUID,
    p_student_id   UUID,
    p_due_date     DATE,
    p_issued_by    UUID
) RETURNS library_issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_book  library_books%ROWTYPE;
    v_issue library_issues%ROWTYPE;
BEGIN
    SELECT * INTO v_book
    FROM library_books
    WHERE id = p_book_id
      AND school_id = p_school_id
      AND is_deleted = false
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_book.available_copies < 1 THEN
        RAISE EXCEPTION 'No copies available' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM students
        WHERE id = p_student_id
          AND school_id = p_school_id
          AND is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Student not found in this school' USING ERRCODE = 'P0002';
    END IF;

    UPDATE library_books
    SET available_copies = available_copies - 1
    WHERE id = p_book_id;

    INSERT INTO library_issues (
        school_id, book_id, student_id, due_date, fine_paid
    ) VALUES (
        p_school_id, p_book_id, p_student_id, p_due_date, false
    )
    RETURNING * INTO v_issue;

    RETURN v_issue;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. return_library_book
--    Locks the issue row, increments available copies (capped at
--    total_copies defensively), marks the issue returned.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION return_library_book(
    p_school_id   UUID,
    p_issue_id    UUID,
    p_fine_amount NUMERIC DEFAULT NULL,
    p_fine_paid   BOOLEAN DEFAULT false
) RETURNS library_issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_issue library_issues%ROWTYPE;
BEGIN
    SELECT * INTO v_issue
    FROM library_issues
    WHERE id = p_issue_id
      AND school_id = p_school_id
      AND returned_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Issue not found or already returned' USING ERRCODE = 'P0002';
    END IF;

    UPDATE library_books
    SET available_copies = LEAST(available_copies + 1, total_copies)
    WHERE id = v_issue.book_id;

    UPDATE library_issues
    SET returned_at = now(),
        fine_amount = p_fine_amount,
        fine_paid   = p_fine_paid
    WHERE id = v_issue.id
    RETURNING * INTO v_issue;

    RETURN v_issue;
END;
$$;
