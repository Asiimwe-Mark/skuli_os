-- Queue for push notifications from edge functions (Deno can't use web-push)
CREATE TABLE push_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  url        text,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  error      text
);

ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) and admins can access
CREATE POLICY "service_role_push_queue" ON push_queue FOR ALL
  USING (true);

-- Add index for efficient polling
CREATE INDEX idx_push_queue_pending ON push_queue (status, created_at) WHERE status = 'pending';
