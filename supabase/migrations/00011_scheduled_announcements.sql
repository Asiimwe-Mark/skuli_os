-- Support scheduled SMS send (datetime picker on compose page)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS
    scheduled_status text NOT NULL DEFAULT 'pending'
    CHECK (scheduled_status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'));

CREATE INDEX idx_announcements_scheduled
    ON announcements(scheduled_at, scheduled_status)
    WHERE scheduled_at IS NOT NULL AND scheduled_status = 'pending';
