# Parent-Teacher Meeting Scheduler — Design Spec

**Date:** 2026-05-28  
**Step:** 11  
**Status:** Approved

## Overview

A meeting scheduling system that allows school admins to create teacher availability slots and parents to book parent-teacher meetings. Includes SMS confirmations and daily reminders.

## Architecture

**Approach:** DB-Centric with RLS  
**Pattern:** Matches existing features (fee discounts, expenses, discipline)

### Components

1. **Database** — `meeting_slots` + `meeting_bookings` tables with RLS
2. **Admin Dashboard** — `/dashboard/meetings` page for slot management
3. **Parent Portal** — `/portal/meetings` page for booking
4. **API Routes** — `/api/meetings/*` and `/api/portal/meetings/*`
5. **Edge Function** — `meeting-reminders` for daily SMS reminders

---

## Database Schema

### `meeting_slots`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| school_id | uuid | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| teacher_id | uuid | NOT NULL, FK → staff(id) ON DELETE CASCADE |
| slot_date | date | NOT NULL |
| start_time | time | NOT NULL |
| end_time | time | NOT NULL |
| duration_minutes | int | NOT NULL, default 15 |
| is_booked | boolean | NOT NULL, default false |
| is_deleted | boolean | NOT NULL, default false |

### `meeting_bookings`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| slot_id | uuid | NOT NULL, FK → meeting_slots(id) ON DELETE CASCADE |
| school_id | uuid | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| student_id | uuid | NOT NULL, FK → students(id) ON DELETE CASCADE |
| parent_name | text | NOT NULL |
| parent_phone | text | NOT NULL |
| notes | text | |
| status | text | NOT NULL, default 'confirmed', CHECK IN ('confirmed', 'cancelled', 'completed') |
| reminder_sent | boolean | NOT NULL, default false |
| created_at | timestamptz | NOT NULL, default now() |

### RLS Policies

- `school_manage_slots` — school_id = get_user_school_id()
- `school_manage_bookings` — school_id = get_user_school_id()
- `portal_view_bookings` — parent can view bookings for their linked students

### Helper Function

```sql
CREATE OR REPLACE FUNCTION generate_meeting_slots(
  p_school_id uuid,
  p_teacher_id uuid,
  p_slot_date date,
  p_start_time time,
  p_end_time time,
  p_duration_minutes int DEFAULT 15
) RETURNS void AS $$
-- Generates slots from start_time to end_time in p_duration_minutes intervals
-- Skips if slot already exists for that time
```

---

## Admin Dashboard — `/dashboard/meetings`

### Page Structure

- **Header:** "Meeting Scheduler" with school name
- **Controls:**
  - Teacher selector dropdown (all active staff)
  - Date picker (defaults to today)
  - [Generate Slots] button → opens dialog
- **Slot Table:**
  - Time | Duration | Status (Available/Booked) | Student (if booked) | Actions
  - Actions: [Block Slot] / [Unblock] / [Cancel Booking]

### Generate Slots Dialog

- Start Time (default 09:00)
- End Time (default 12:00)
- Duration in minutes (default 15)
- [Generate] button → calls `generate_meeting_slots()` function

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/slots` | List slots for teacher+date |
| POST | `/api/meetings/slots` | Generate slots (calls DB function) |
| PATCH | `/api/meetings/slots/[id]` | Block/unblock slot |
| GET | `/api/meetings/bookings` | List bookings with student info |
| PATCH | `/api/meetings/bookings/[id]` | Cancel/complete booking |

---

## Parent Portal — `/portal/meetings`

### Page Structure

- **Child Selector:** Dropdown if parent has multiple children
- **Teacher Selector:** Filtered by child's class teacher (via `students.class_id` → `classes.class_teacher_id` → `staff.user_id`)
- **Date Picker:** Only shows dates with available slots
- **Time Slot Picker:** Grid of available time slots
- **Notes:** Textarea for optional notes
- **[Book Meeting]** button

### After Booking

- Success message: "Your meeting is booked for {date} at {time} with {teacher_name}"
- SMS confirmation queued via `sms_logs`
- "My Upcoming Meetings" section shows:
  - Date, Time, Teacher, Status
  - [Cancel] button for confirmed meetings

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portal/meetings/teachers?student_id=X` | Class teacher for child (via students→classes→class_teacher_id→staff) |
| GET | `/api/portal/meetings/slots` | Available slots for teacher+date |
| POST | `/api/portal/meetings/book` | Create booking + queue SMS |
| GET | `/api/portal/meetings` | My bookings for a student |
| PATCH | `/api/portal/meetings/[id]` | Cancel booking |

---

## Edge Function — `meeting-reminders`

**Schedule:** Daily at 8:00 AM EAT

**Logic:**
1. Query bookings where:
   - `slot_date = CURRENT_DATE + INTERVAL '1 day'`
   - `reminder_sent = false`
   - `status = 'confirmed'`
2. For each booking:
   - Get school name from `schools`
   - Get teacher name from `staff`
   - Get slot time from `meeting_slots`
   - Queue SMS via `sms_logs`:
     ```
     "Reminder: You have a parent-teacher meeting at {school_name} tomorrow at {time} with {teacher_name}. Reply CANCEL to cancel."
     ```
3. Update `reminder_sent = true`

**Dependencies:**
- `sms_logs` table (existing)
- `send-sms-queue` function (existing)
- `schools`, `staff`, `meeting_slots`, `meeting_bookings` tables

---

## SMS Flow

### Confirmation (on booking)
- Queued to `sms_logs` immediately after booking
- Message: "Your meeting with {teacher_name} on {date} at {time} is confirmed. School: {school_name}"

### Reminder (daily at 8 AM)
- Edge function queries tomorrow's bookings
- Message: "Reminder: You have a parent-teacher meeting at {school_name} tomorrow at {time} with {teacher_name}."

### Cancellation
- Message: "Your meeting with {teacher_name} on {date} at {time} has been cancelled."

---

## Cancellation Flow

- **Parent:** Can cancel via portal → booking status → 'cancelled', slot.is_booked → false
- **Admin:** Can cancel via dashboard → booking status → 'cancelled', slot.is_booked → false
- SMS notification sent to parent on cancellation

---

## File Structure

```
supabase/migrations/
  00022_meetings.sql

app/dashboard/meetings/
  page.tsx

app/portal/meetings/
  page.tsx

app/api/meetings/
  slots/route.ts
  slots/[id]/route.ts
  bookings/route.ts
  bookings/[id]/route.ts

app/api/portal/meetings/
  teachers/route.ts
  slots/route.ts
  book/route.ts
  route.ts
  [id]/route.ts

supabase/functions/
  meeting-reminders/index.ts
```
