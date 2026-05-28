# Parent-Teacher Meeting Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a meeting scheduling system where admins create teacher availability slots and parents book parent-teacher meetings with SMS confirmations and reminders.

**Architecture:** DB-centric with RLS. Two new tables (`meeting_slots`, `meeting_bookings`), admin dashboard at `/dashboard/meetings`, parent portal at `/portal/meetings`, API routes for CRUD, and a Supabase Edge Function for daily SMS reminders.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS + Edge Functions), React Query, Zustand, shadcn/ui, Tailwind CSS, Africa's Talking SMS

---

## File Structure

```
supabase/migrations/
  00022_meetings.sql              -- DB tables, RLS, helper function

app/api/meetings/
  slots/route.ts                  -- GET (list), POST (generate)
  slots/[id]/route.ts             -- PATCH (block/unblock)
  bookings/route.ts               -- GET (list)
  bookings/[id]/route.ts          -- PATCH (cancel/complete)

app/api/portal/meetings/
  teachers/route.ts               -- GET (child's class teacher)
  slots/route.ts                  -- GET (available slots)
  book/route.ts                   -- POST (create booking + SMS)
  route.ts                        -- GET (my bookings)
  [id]/route.ts                   -- PATCH (cancel)

app/dashboard/meetings/
  page.tsx                        -- Admin meeting slot management

app/portal/meetings/
  page.tsx                        -- Parent booking page

components/dashboard/sidebar.tsx  -- Add "Meetings" nav link

supabase/functions/
  meeting-reminders/index.ts      -- Daily SMS reminder edge function

types/index.ts                    -- Add MeetingSlot, MeetingBooking types
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00022_meetings.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Verify migration syntax**

Run: `npx supabase db diff` (or review manually)
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00022_meetings.sql
git commit -m "feat(db): add meeting_slots and meeting_bookings tables with RLS"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add MeetingSlot and MeetingBooking types**

Add after the `Staff` interface (around line 345):

```typescript
export interface MeetingSlot {
  id: string;
  school_id: string;
  teacher_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_booked: boolean;
  is_deleted: boolean;
  // Joined
  teacher?: Staff;
  booking?: MeetingBooking;
}

export interface MeetingBooking {
  id: string;
  slot_id: string;
  school_id: string;
  student_id: string;
  parent_name: string;
  parent_phone: string;
  notes: string | null;
  status: 'confirmed' | 'cancelled' | 'completed';
  reminder_sent: boolean;
  created_at: string;
  // Joined
  slot?: MeetingSlot;
  student?: Student;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add MeetingSlot and MeetingBooking types"
```

---

## Task 3: Admin API Routes — Slots

**Files:**
- Create: `app/api/meetings/slots/route.ts`
- Create: `app/api/meetings/slots/[id]/route.ts`

- [ ] **Step 1: Create GET/POST slots route**

```typescript
// app/api/meetings/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher_id");
  const date = searchParams.get("date");

  if (!teacherId || !date) {
    return NextResponse.json({ error: "teacher_id and date required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("meeting_slots")
    .select(`
      *,
      booking:meeting_bookings(id, student_id, parent_name, parent_phone, notes, status, student:students(full_name))
    `)
    .eq("teacher_id", teacherId)
    .eq("slot_date", date)
    .eq("is_deleted", false)
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { teacher_id, slot_date, start_time, end_time, duration_minutes } = body;

  if (!teacher_id || !slot_date || !start_time || !end_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get school_id from current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const { error } = await supabase.rpc("generate_meeting_slots", {
    p_school_id: userProfile.school_id,
    p_teacher_id: teacher_id,
    p_slot_date: slot_date,
    p_start_time: start_time,
    p_end_time: end_time,
    p_duration_minutes: duration_minutes || 15,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Create PATCH slot route (block/unblock)**

```typescript
// app/api/meetings/slots/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { is_deleted } = body;

  if (typeof is_deleted !== "boolean") {
    return NextResponse.json({ error: "is_deleted boolean required" }, { status: 400 });
  }

  // If blocking, cancel any existing booking first
  if (is_deleted) {
    await supabase
      .from("meeting_bookings")
      .update({ status: "cancelled" })
      .eq("slot_id", id)
      .eq("status", "confirmed");
  }

  const { data, error } = await supabase
    .from("meeting_slots")
    .update({ is_deleted })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/meetings/slots/
git commit -m "feat(api): add meeting slots CRUD routes"
```

---

## Task 4: Admin API Routes — Bookings

**Files:**
- Create: `app/api/meetings/bookings/route.ts`
- Create: `app/api/meetings/bookings/[id]/route.ts`

- [ ] **Step 1: Create GET bookings route**

```typescript
// app/api/meetings/bookings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher_id");
  const date = searchParams.get("date");

  let query = supabase
    .from("meeting_bookings")
    .select(`
      *,
      slot:meeting_slots!inner(teacher_id, slot_date, start_time, end_time),
      student:students(full_name, admission_number)
    `)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  if (teacherId) {
    query = query.eq("meeting_slots.teacher_id", teacherId);
  }
  if (date) {
    query = query.eq("meeting_slots.slot_date", date);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create PATCH booking route (cancel/complete)**

```typescript
// app/api/meetings/bookings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["cancelled", "completed"].includes(status)) {
    return NextResponse.json({ error: "status must be cancelled or completed" }, { status: 400 });
  }

  // Get booking to find slot_id
  const { data: booking } = await supabase
    .from("meeting_bookings")
    .select("slot_id, school_id, parent_phone, parent_name")
    .eq("id", id)
    .single();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Update booking status
  const { data, error } = await supabase
    .from("meeting_bookings")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If cancelled, free up the slot
  if (status === "cancelled") {
    await supabase
      .from("meeting_slots")
      .update({ is_booked: false })
      .eq("id", booking.slot_id);

    // Queue cancellation SMS
    const { data: slot } = await supabase
      .from("meeting_slots")
      .select("slot_date, start_time, teacher:staff(full_name)")
      .eq("id", booking.slot_id)
      .single();

    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", booking.school_id)
      .single();

    if (slot && school) {
      const teacherName = (slot.teacher as Record<string, unknown>)?.full_name ?? "your teacher";
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: `Your meeting with ${teacherName} on ${slot.slot_date} at ${slot.start_time} has been cancelled. School: ${school.name}`,
        message_type: "meeting_cancellation",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: id,
      });
    }
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/meetings/bookings/
git commit -m "feat(api): add meeting bookings admin routes"
```

---

## Task 5: Parent Portal API Routes

**Files:**
- Create: `app/api/portal/meetings/teachers/route.ts`
- Create: `app/api/portal/meetings/slots/route.ts`
- Create: `app/api/portal/meetings/book/route.ts`
- Create: `app/api/portal/meetings/route.ts`
- Create: `app/api/portal/meetings/[id]/route.ts`

- [ ] **Step 1: Create teachers route**

```typescript
// app/api/portal/meetings/teachers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId) {
    return NextResponse.json({ error: "student_id required" }, { status: 400 });
  }

  // Get student's class teacher
  const { data: student } = await supabase
    .from("students")
    .select("current_class_id, classes(class_teacher_id, name)")
    .eq("id", studentId)
    .single();

  if (!student?.current_class_id) {
    return NextResponse.json([]);
  }

  const classData = student.classes as Record<string, unknown> | null;
  const classTeacherId = classData?.class_teacher_id as string | null;

  if (!classTeacherId) {
    return NextResponse.json([]);
  }

  // Get staff record for the class teacher
  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, role_title")
    .eq("user_id", classTeacherId)
    .eq("is_active", true)
    .single();

  if (!staff) return NextResponse.json([]);
  return NextResponse.json([staff]);
}
```

- [ ] **Step 2: Create available slots route**

```typescript
// app/api/portal/meetings/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher_id");
  const date = searchParams.get("date");

  if (!teacherId || !date) {
    return NextResponse.json({ error: "teacher_id and date required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("meeting_slots")
    .select("id, slot_date, start_time, end_time, duration_minutes")
    .eq("teacher_id", teacherId)
    .eq("slot_date", date)
    .eq("is_booked", false)
    .eq("is_deleted", false)
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create book route**

```typescript
// app/api/portal/meetings/book/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { slot_id, student_id, parent_name, parent_phone, notes } = body;

  if (!slot_id || !student_id || !parent_name || !parent_phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify slot is available
  const { data: slot } = await supabase
    .from("meeting_slots")
    .select("id, school_id, is_booked, is_deleted, teacher_id, slot_date, start_time, end_time")
    .eq("id", slot_id)
    .single();

  if (!slot || slot.is_booked || slot.is_deleted) {
    return NextResponse.json({ error: "Slot not available" }, { status: 400 });
  }

  // Verify parent has access to this student
  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", student_id)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  // Create booking
  const { data: booking, error: bookingError } = await supabase
    .from("meeting_bookings")
    .insert({
      slot_id,
      school_id: slot.school_id,
      student_id,
      parent_name,
      parent_phone,
      notes,
    })
    .select()
    .single();

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });

  // Mark slot as booked
  await supabase
    .from("meeting_slots")
    .update({ is_booked: true })
    .eq("id", slot_id);

  // Get teacher name and school name for SMS
  const { data: staff } = await supabase
    .from("staff")
    .select("full_name")
    .eq("id", slot.teacher_id)
    .single();

  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", slot.school_id)
    .single();

  // Queue confirmation SMS
  await supabase.from("sms_logs").insert({
    school_id: slot.school_id,
    recipient_phone: parent_phone,
    message_body: `Your meeting with ${staff?.full_name ?? "teacher"} on ${slot.slot_date} at ${slot.start_time} is confirmed. School: ${school?.name ?? ""}`,
    message_type: "meeting_confirmation",
    status: "pending",
    related_entity_type: "meeting_booking",
    related_entity_id: booking.id,
  });

  return NextResponse.json(booking);
}
```

- [ ] **Step 4: Create my bookings route**

```typescript
// app/api/portal/meetings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");

  if (!studentId) {
    return NextResponse.json({ error: "student_id required" }, { status: 400 });
  }

  // Verify parent has access
  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", studentId)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("meeting_bookings")
    .select(`
      *,
      slot:meeting_slots(slot_date, start_time, end_time, teacher:staff(full_name)),
      student:students(full_name)
    `)
    .eq("student_id", studentId)
    .in("status", ["confirmed", "completed"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 5: Create cancel booking route**

```typescript
// app/api/portal/meetings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Get booking
  const { data: booking } = await supabase
    .from("meeting_bookings")
    .select("id, slot_id, school_id, student_id, parent_phone")
    .eq("id", id)
    .single();

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify parent has access
  const { data: parentLink } = await supabase
    .from("parent_students")
    .select("student_id")
    .eq("parent_id", user.id)
    .eq("student_id", booking.student_id)
    .single();

  if (!parentLink) {
    return NextResponse.json({ error: "Not linked to this student" }, { status: 403 });
  }

  // Cancel booking
  const { data, error } = await supabase
    .from("meeting_bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Free up the slot
  await supabase
    .from("meeting_slots")
    .update({ is_booked: false })
    .eq("id", booking.slot_id);

  // Queue cancellation SMS
  const { data: slot } = await supabase
    .from("meeting_slots")
    .select("slot_date, start_time, teacher:staff(full_name)")
    .eq("id", booking.slot_id)
    .single();

  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", booking.school_id)
    .single();

  if (slot && school) {
    const teacherName = (slot.teacher as Record<string, unknown>)?.full_name ?? "your teacher";
    await supabase.from("sms_logs").insert({
      school_id: booking.school_id,
      recipient_phone: booking.parent_phone,
      message_body: `Your meeting with ${teacherName} on ${slot.slot_date} at ${slot.start_time} has been cancelled. School: ${school.name}`,
      message_type: "meeting_cancellation",
      status: "pending",
      related_entity_type: "meeting_booking",
      related_entity_id: id,
    });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/api/portal/meetings/
git commit -m "feat(api): add parent portal meeting routes"
```

---

## Task 6: Admin Dashboard Page

**Files:**
- Create: `app/dashboard/meetings/page.tsx`

- [ ] **Step 1: Create the admin meetings page**

```typescript
// app/dashboard/meetings/page.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Loader2,
  Plus,
  Ban,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react";
import type { Staff, MeetingSlot } from "@/types";

export default function MeetingsPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(15);

  // Fetch active staff
  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["staff", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, full_name, role_title, is_active")
        .eq("school_id", school!.id)
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
    enabled: !!school?.id,
  });

  // Fetch slots
  const { data: slots = [], isLoading: slotsLoading } = useQuery<MeetingSlot[]>({
    queryKey: ["meeting-slots", selectedTeacherId, selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
      );
      return res.json();
    },
    enabled: !!selectedTeacherId && !!selectedDate,
  });

  // Generate slots mutation
  const generateSlots = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meetings/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacher_id: selectedTeacherId,
          slot_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: duration,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate slots");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      setGenerateDialogOpen(false);
      toast({ title: "Slots generated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to generate slots", variant: "destructive" });
    },
  });

  // Block/unblock slot mutation
  const toggleSlotBlock = useMutation({
    mutationFn: async ({ id, is_deleted }: { id: string; is_deleted: boolean }) => {
      const res = await fetch(`/api/meetings/slots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_deleted }),
      });
      if (!res.ok) throw new Error("Failed to update slot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      toast({ title: "Slot updated" });
    },
  });

  // Cancel booking mutation
  const cancelBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/meetings/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel booking");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      toast({ title: "Booking cancelled" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Scheduler</h1>
          <p className="text-sm text-gray-500">{school?.name}</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label>Teacher</Label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select teacher...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.role_title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => setGenerateDialogOpen(true)}
              disabled={!selectedTeacherId}
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate Slots
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Slots Table */}
      {selectedTeacherId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Slots for {selectedDate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-2 text-sm">No slots generated for this date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Duration</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Student</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {slots.map((slot) => {
                      const booking = Array.isArray(slot.booking) ? slot.booking[0] : slot.booking;
                      return (
                        <tr key={slot.id}>
                          <td className="py-3 font-medium">
                            {slot.start_time} — {slot.end_time}
                          </td>
                          <td className="py-3 text-gray-500">
                            {slot.duration_minutes} min
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={slot.is_deleted ? "destructive" : booking ? "default" : "secondary"}
                            >
                              {slot.is_deleted ? "Blocked" : booking ? "Booked" : "Available"}
                            </Badge>
                          </td>
                          <td className="py-3 text-gray-600">
                            {booking?.student?.full_name ?? "—"}
                          </td>
                          <td className="py-3 text-right">
                            {slot.is_deleted ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSlotBlock.mutate({ id: slot.id, is_deleted: false })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Unblock
                              </Button>
                            ) : booking ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => cancelBooking.mutate(booking.id)}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel Booking
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSlotBlock.mutate({ id: slot.id, is_deleted: true })}
                              >
                                <Ban className="h-4 w-4 mr-1" />
                                Block
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Slots Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Meeting Slots</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={5}
                max={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => generateSlots.mutate()} disabled={generateSlots.isPending}>
              {generateSlots.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/meetings/page.tsx
git commit -m "feat(ui): add admin meeting slot management page"
```

---

## Task 7: Sidebar Navigation Link

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add Meetings link to sidebar**

Add to the `NAV_ITEMS` array after the "Staff & Payroll" section (around line 123):

```typescript
{
  label: "Meetings",
  icon: UserCheck,
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  children: [
    { label: "Schedule Meetings", href: "/dashboard/meetings", icon: Calendar },
  ],
},
```

Add `UserCheck` to the lucide-react imports if not already present.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(nav): add Meetings link to sidebar"
```

---

## Task 8: Parent Portal Page

**Files:**
- Create: `app/portal/meetings/page.tsx`

- [ ] **Step 1: Create the parent portal meetings page**

```typescript
// app/portal/meetings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import {
  Calendar,
  Clock,
  Loader2,
  ChevronDown,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react";

interface PortalStudent {
  id: string;
  full_name: string;
  admission_number: string | null;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
}

interface Teacher {
  id: string;
  full_name: string;
  role_title: string;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

interface Booking {
  id: string;
  slot_id: string;
  parent_name: string;
  parent_phone: string;
  notes: string | null;
  status: string;
  created_at: string;
  slot: {
    slot_date: string;
    start_time: string;
    end_time: string;
    teacher: { full_name: string } | null;
  } | null;
  student: { full_name: string } | null;
}

export default function PortalMeetingsPage() {
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<PortalStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load linked students
  useEffect(() => {
    async function loadStudents() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("students")
        .select("id, full_name, admission_number, class:classes(id, name), school:schools(id, name)")
        .eq("parent_id", user.id);

      if (data && data.length > 0) {
        const mapped = data.map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          class: s.class,
          school: s.school,
        }));
        setLinkedStudents(mapped);
        setSelectedStudentId(mapped[0].id);
      }
      setLoading(false);
    }
    loadStudents();
  }, [supabase]);

  // Load teachers when student changes
  useEffect(() => {
    if (!selectedStudentId) return;
    async function loadTeachers() {
      const res = await fetch(`/api/portal/meetings/teachers?student_id=${selectedStudentId}`);
      const data = await res.json();
      setTeachers(data);
      if (data.length > 0) setSelectedTeacherId(data[0].id);
      else setSelectedTeacherId("");
    }
    loadTeachers();
  }, [selectedStudentId]);

  // Load available dates when teacher changes
  useEffect(() => {
    if (!selectedTeacherId) return;
    async function loadDates() {
      // Get dates with available slots
      const res = await fetch(`/api/meetings/slots?teacher_id=${selectedTeacherId}&date=`);
      // We'll need a separate endpoint for dates, or use the slots endpoint
      // For now, set date to today
      setSelectedDate(new Date().toISOString().split("T")[0]);
    }
    loadDates();
  }, [selectedTeacherId]);

  // Load available slots when date changes
  useEffect(() => {
    if (!selectedTeacherId || !selectedDate) return;
    async function loadSlots() {
      const res = await fetch(
        `/api/portal/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
      );
      const data = await res.json();
      setAvailableSlots(data);
      setSelectedSlotId("");
    }
    loadSlots();
  }, [selectedTeacherId, selectedDate]);

  // Load my bookings
  useEffect(() => {
    if (!selectedStudentId) return;
    async function loadBookings() {
      const res = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      const data = await res.json();
      setBookings(data);
    }
    loadBookings();
  }, [selectedStudentId]);

  // Book meeting
  async function handleBook() {
    if (!selectedSlotId || !parentName || !parentPhone) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/portal/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_id: selectedSlotId,
          student_id: selectedStudentId,
          parent_name: parentName,
          parent_phone: parentPhone,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to book");
      }

      const slot = availableSlots.find((s) => s.id === selectedSlotId);
      const teacher = teachers.find((t) => t.id === selectedTeacherId);
      setSuccess(
        `Your meeting is booked for ${slot?.slot_date} at ${slot?.start_time} with ${teacher?.full_name}. You will receive an SMS reminder.`
      );

      // Reset form
      setSelectedSlotId("");
      setNotes("");

      // Reload bookings
      const bookingsRes = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      setBookings(await bookingsRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Cancel booking
  async function handleCancel(bookingId: string) {
    try {
      const res = await fetch(`/api/portal/meetings/${bookingId}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to cancel");

      // Reload
      const bookingsRes = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      setBookings(await bookingsRes.json());

      // Reload slots
      if (selectedTeacherId && selectedDate) {
        const slotsRes = await fetch(
          `/api/portal/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
        );
        setAvailableSlots(await slotsRes.json());
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-60 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Child Selector */}
        {linkedStudents.length > 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <UserCheck className="h-5 w-5 text-indigo-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Select Child</h2>
            </div>
            <div className="relative">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700"
              >
                {linkedStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.class?.name ?? "N/A"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}

        <h1 className="text-lg font-bold text-gray-900">Book a Parent-Teacher Meeting</h1>

        {/* Teacher Selector */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Teacher</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full mt-1 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select teacher...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
            />
          </div>

          {/* Time Slot Picker */}
          {availableSlots.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Available Times</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {availableSlots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      selectedSlotId === slot.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30"
                    )}
                  >
                    {slot.start_time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {availableSlots.length === 0 && selectedTeacherId && selectedDate && (
            <p className="text-sm text-gray-500">No available slots for this date</p>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              placeholder="What would you like to discuss?"
            />
          </div>

          {/* Parent Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Your Name</label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* Book Button */}
          <button
            onClick={handleBook}
            disabled={!selectedSlotId || !parentName || !parentPhone || submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              "Book Meeting"
            )}
          </button>

          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 inline mr-1" />
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 inline mr-1" />
              {error}
            </div>
          )}
        </div>

        {/* My Upcoming Meetings */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">My Upcoming Meetings</h2>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming meetings</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {b.slot?.teacher?.full_name ?? "Teacher"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {b.slot?.slot_date} at {b.slot?.start_time}
                    </p>
                  </div>
                  {b.status === "confirmed" && (
                    <button
                      onClick={() => handleCancel(b.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/portal/meetings/page.tsx
git commit -m "feat(ui): add parent portal meeting booking page"
```

---

## Task 9: Reminder Edge Function

**Files:**
- Create: `supabase/functions/meeting-reminders/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// Supabase Edge Function: meeting-reminders
// Daily cron at 8AM EAT — finds tomorrow's bookings, sends reminder SMS via sms_logs
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find confirmed bookings for tomorrow that haven't been reminded
    const { data: bookings, error } = await supabase
      .from("meeting_bookings")
      .select(`
        id,
        school_id,
        parent_phone,
        parent_name,
        slot:meeting_slots!inner(
          slot_date,
          start_time,
          end_time,
          teacher:staff(full_name)
        ),
        school:schools(name)
      `)
      .eq("status", "confirmed")
      .eq("reminder_sent", false)
      .eq("meeting_slots.slot_date", tomorrowStr);

    if (error) throw error;
    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders to send" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;

    for (const booking of bookings) {
      const slot = booking.slot as unknown as {
        slot_date: string;
        start_time: string;
        teacher: { full_name: string } | null;
      };
      const school = booking.school as unknown as { name: string } | null;

      const teacherName = slot?.teacher?.full_name ?? "your teacher";
      const schoolName = school?.name ?? "school";
      const time = slot?.start_time ?? "";

      const message = `Reminder: You have a parent-teacher meeting at ${schoolName} tomorrow at ${time} with ${teacherName}.`;

      // Queue SMS
      await supabase.from("sms_logs").insert({
        school_id: booking.school_id,
        recipient_phone: booking.parent_phone,
        message_body: message,
        message_type: "meeting_reminder",
        status: "pending",
        related_entity_type: "meeting_booking",
        related_entity_id: booking.id,
      });

      // Mark reminder as sent
      await supabase
        .from("meeting_bookings")
        .update({ reminder_sent: true })
        .eq("id", booking.id);

      sent++;
    }

    return new Response(
      JSON.stringify({ message: `Queued ${sent} meeting reminders` }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/meeting-reminders/
git commit -m "feat(edge): add meeting-reminders edge function for daily SMS"
```

---

## Task 10: Portal Sidebar Link

**Files:**
- Modify: `app/portal/layout.tsx`

- [ ] **Step 1: Add Meetings link to portal sidebar**

Find the portal navigation section and add a "Meetings" link. The portal layout uses a bottom navigation or sidebar. Add:

```typescript
{ label: "Meetings", href: "/portal/meetings", icon: UserCheck }
```

Import `UserCheck` from lucide-react if needed.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/portal/layout.tsx
git commit -m "feat(nav): add Meetings link to parent portal"
```

---

## Task 11: Build Verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: resolve any build issues from meeting scheduler feature"
```
