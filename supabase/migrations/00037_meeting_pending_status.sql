-- Add 'pending' status to meeting_bookings so teacher must confirm availability
-- Flow: parent books → 'pending' → teacher confirms → 'confirmed'

ALTER TABLE meeting_bookings
  DROP CONSTRAINT IF EXISTS meeting_bookings_status_check;

ALTER TABLE meeting_bookings
  ADD CONSTRAINT meeting_bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'));

ALTER TABLE meeting_bookings
  ALTER COLUMN status SET DEFAULT 'pending';
