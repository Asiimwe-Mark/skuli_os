-- Migration 00023: Two-Way Parent Messaging
-- Creates message_threads and thread_messages tables with RLS

-- Message threads (one per parent phone per school)
CREATE TABLE message_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_phone    text NOT NULL,
  student_id      uuid REFERENCES students(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  is_read         boolean NOT NULL DEFAULT false,
  is_deleted      boolean NOT NULL DEFAULT false,
  UNIQUE (school_id, parent_phone)
);

-- Thread messages (individual messages)
CREATE TABLE thread_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body            text NOT NULL,
  sender_name     text,
  at_message_id   text,
  status          text NOT NULL DEFAULT 'delivered'
                  CHECK (status IN ('sent', 'delivered', 'failed')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_threads_last_msg ON message_threads(school_id, last_message_at DESC)
  WHERE is_deleted = false;

CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, sent_at)
  WHERE is_deleted = false;

-- RLS
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_manage_threads" ON message_threads FOR ALL
  USING (school_id = get_user_school_id());

CREATE POLICY "school_manage_thread_msgs" ON thread_messages FOR ALL
  USING (school_id = get_user_school_id());
