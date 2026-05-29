-- Push notification subscriptions for PWA
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false,
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage their own subscriptions
CREATE POLICY "users_own_push_subscriptions" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- School admins can view subscriptions in their school
CREATE POLICY "school_admin_view_push_subscriptions" ON push_subscriptions FOR SELECT
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'));

-- SUPER_ADMIN sees all
CREATE POLICY "super_admin_push_subscriptions" ON push_subscriptions FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');
