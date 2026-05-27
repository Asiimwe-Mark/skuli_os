-- Add review status to marks table for the approval workflow
ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    review_status text NOT NULL DEFAULT 'not_started'
    CHECK (review_status IN ('not_started', 'draft', 'submitted', 'approved', 'rejected'));

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    review_comment text;

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    reviewed_by uuid REFERENCES users(id);

ALTER TABLE marks ADD COLUMN IF NOT EXISTS
    reviewed_at timestamptz;

-- Index for review status queries
CREATE INDEX IF NOT EXISTS idx_marks_review_status
    ON marks(school_id, class_id, term_id, review_status)
    WHERE is_deleted = false;
