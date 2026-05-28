-- Migration 00022: Parent-Teacher Meeting Scheduler
-- Creates meeting_slots and meeting_bookings tables with RLS and helper function

-- Meeting slots (teacher availability)
CREATE TABLE meeting_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  slot_date       date NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 15,
  is_booked       boolean NOT NULL DEFAULT false,
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Meeting bookings (parent reservations)
CREATE TABLE meeting_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid NOT NULL REFERENCES meeting_slots(id) ON DELETE CASCADE,
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_name     text NOT NULL,
  parent_phone    text NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  reminder_sent   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_meeting_slots_teacher_date ON meeting_slots(school_id, teacher_id, slot_date)
  WHERE is_deleted = false;

CREATE INDEX idx_meeting_slots_available ON meeting_slots(school_id, slot_date, is_booked)
  WHERE is_deleted = false AND is_booked = false;

CREATE INDEX idx_meeting_bookings_slot ON meeting_bookings(slot_id)
  WHERE status = 'confirmed';

CREATE INDEX idx_meeting_bookings_reminder ON meeting_bookings(school_id, reminder_sent, status)
  WHERE status = 'confirmed' AND reminder_sent = false;

-- RLS
ALTER TABLE meeting_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_bookings ENABLE ROW LEVEL SECURITY;

-- Admins can manage all slots for their school
CREATE POLICY "school_manage_slots" ON meeting_slots FOR ALL
  USING (school_id = get_user_school_id());

-- Admins can manage all bookings for their school
CREATE POLICY "school_manage_bookings" ON meeting_bookings FOR ALL
  USING (school_id = get_user_school_id());

-- Parents can view bookings for their linked students
CREATE POLICY "portal_view_bookings" ON meeting_bookings FOR SELECT
  USING (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Parents can insert bookings for their linked students
CREATE POLICY "portal_insert_bookings" ON meeting_bookings FOR INSERT
  WITH CHECK (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Parents can update (cancel) their own bookings
CREATE POLICY "portal_update_bookings" ON meeting_bookings FOR UPDATE
  USING (student_id IN (
    SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
  ));

-- Helper function: generate meeting slots for a teacher on a given date
CREATE OR REPLACE FUNCTION generate_meeting_slots(
  p_school_id uuid,
  p_teacher_id uuid,
  p_slot_date date,
  p_start_time time,
  p_end_time time,
  p_duration_minutes int DEFAULT 15
) RETURNS void AS $$
DECLARE
  slot_start time;
  slot_end time;
BEGIN
  slot_start := p_start_time;
  LOOP
    slot_end := slot_start + (p_duration_minutes || ' minutes')::interval;
    EXIT WHEN slot_end > p_end_time;

    -- Skip if slot already exists
    IF NOT EXISTS (
      SELECT 1 FROM meeting_slots
      WHERE school_id = p_school_id
        AND teacher_id = p_teacher_id
        AND slot_date = p_slot_date
        AND start_time = slot_start
        AND is_deleted = false
    ) THEN
      INSERT INTO meeting_slots (school_id, teacher_id, slot_date, start_time, end_time, duration_minutes)
      VALUES (p_school_id, p_teacher_id, p_slot_date, slot_start, slot_end, p_duration_minutes);
    END IF;

    slot_start := slot_end;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
