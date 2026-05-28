# Two-Way Parent Messaging (SMS Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-way SMS inbox where parents can reply to school messages and admins can view/respond in a WhatsApp-style conversation UI.

**Architecture:** DB-Centric with RLS. Two new tables (`message_threads`, `thread_messages`), inbox page at `/dashboard/communication/inbox`, updated webhook for inbound SMS, and reply API route.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS + Realtime), React Query, Zustand, shadcn/ui, Tailwind CSS, Africa's Talking SMS

---

## File Structure

```
supabase/migrations/
  00023_message_threads.sql           -- DB tables, indexes, RLS

app/api/communication/
  threads/route.ts                    -- GET list threads
  threads/[id]/route.ts               -- PATCH mark as read
  threads/[id]/messages/route.ts      -- GET messages for thread
  reply/route.ts                      -- POST send reply SMS

app/api/webhooks/africas-talking/
  sms/route.ts                        -- UPDATE to handle inbound SMS

app/dashboard/communication/
  inbox/page.tsx                      -- Two-panel inbox UI

types/index.ts                        -- Add ThreadWithPreview type
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00023_message_threads.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00023_message_threads.sql
git commit -m "feat(db): add message_threads and thread_messages tables with RLS"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add ThreadWithPreview type**

The `types/database.ts` file already has `message_threads` and `thread_messages` row types defined. Add a convenience type to `types/index.ts` after the `MeetingBooking` interface:

```typescript
export interface ThreadWithPreview {
  id: string;
  school_id: string;
  parent_phone: string;
  student_id: string | null;
  last_message_at: string;
  is_read: boolean;
  is_deleted: boolean;
  // Joined
  student?: { full_name: string; admission_number: string | null } | null;
  last_message?: { body: string; direction: string } | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add ThreadWithPreview type for inbox"
```

---

## Task 3: API Route — List Threads

**Files:**
- Create: `app/api/communication/threads/route.ts`

- [ ] **Step 1: Create the threads list route**

```typescript
// app/api/communication/threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's school_id
  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  let query = supabase
    .from("message_threads")
    .select(`
      *,
      student:students(full_name, admission_number)
    `)
    .eq("school_id", userProfile.school_id)
    .eq("is_deleted", false)
    .order("last_message_at", { ascending: false });

  if (search) {
    query = query.or(`parent_phone.ilike.%${search}%,student.full_name.ilike.%${search}%`);
  }

  const { data: threads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get last message for each thread
  const threadIds = (threads || []).map((t) => t.id);
  let lastMessages: Record<string, { body: string; direction: string }> = {};

  if (threadIds.length > 0) {
    const { data: msgs } = await supabase
      .from("thread_messages")
      .select("thread_id, body, direction, sent_at")
      .in("thread_id", threadIds)
      .eq("is_deleted", false)
      .order("sent_at", { ascending: false });

    if (msgs) {
      for (const msg of msgs) {
        if (!lastMessages[msg.thread_id]) {
          lastMessages[msg.thread_id] = { body: msg.body, direction: msg.direction };
        }
      }
    }
  }

  const result = (threads || []).map((t) => ({
    ...t,
    last_message: lastMessages[t.id] || null,
  }));

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/communication/threads/
git commit -m "feat(api): add threads list route"
```

---

## Task 4: API Route — Thread Messages

**Files:**
- Create: `app/api/communication/threads/[id]/messages/route.ts`

- [ ] **Step 1: Create the messages route**

```typescript
// app/api/communication/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: threadId } = await params;

  // Get user's school_id
  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  // Verify thread belongs to this school
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, school_id, parent_phone, student_id, student:students(full_name, parent_name)")
    .eq("id", threadId)
    .eq("school_id", userProfile.school_id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Get messages
  const { data: messages, error } = await supabase
    .from("thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .eq("is_deleted", false)
    .order("sent_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ thread, messages: messages || [] });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/communication/threads/\[id\]/messages/
git commit -m "feat(api): add thread messages route"
```

---

## Task 5: API Route — Mark Thread as Read

**Files:**
- Create: `app/api/communication/threads/[id]/route.ts`

- [ ] **Step 1: Create the mark-as-read route**

```typescript
// app/api/communication/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: threadId } = await params;
  const body = await req.json();
  const { is_read } = body;

  if (typeof is_read !== "boolean") {
    return NextResponse.json({ error: "is_read boolean required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("message_threads")
    .update({ is_read })
    .eq("id", threadId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/communication/threads/\[id\]/
git commit -m "feat(api): add mark thread as read route"
```

---

## Task 6: API Route — Reply

**Files:**
- Create: `app/api/communication/reply/route.ts`

- [ ] **Step 1: Create the reply route**

```typescript
// app/api/communication/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's school_id and name
  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id, full_name")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const body = await req.json();
  const { thread_id, message_body } = body;

  if (!thread_id || !message_body) {
    return NextResponse.json({ error: "thread_id and message_body required" }, { status: 400 });
  }

  // Get thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, school_id, parent_phone")
    .eq("id", thread_id)
    .eq("school_id", userProfile.school_id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Get school AT credentials
  const { data: school } = await supabase
    .from("schools")
    .select("name, africas_talking_username, africas_talking_api_key, africas_talking_username_enc, africas_talking_api_key_enc")
    .eq("id", userProfile.school_id)
    .single();

  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  let atUsername = school.africas_talking_username || "";
  let atApiKey = school.africas_talking_api_key || "";

  // Try encrypted credentials
  if (school.africas_talking_api_key_enc && process.env.SUPABASE_VAULT_SECRET_KEY) {
    try {
      const { data: decKey } = await supabase.rpc("decrypt_secret", {
        encrypted: school.africas_talking_api_key_enc,
        key: process.env.SUPABASE_VAULT_SECRET_KEY,
      });
      if (decKey) atApiKey = decKey;
      if (school.africas_talking_username_enc) {
        const { data: decUser } = await supabase.rpc("decrypt_secret", {
          encrypted: school.africas_talking_username_enc,
          key: process.env.SUPABASE_VAULT_SECRET_KEY,
        });
        if (decUser) atUsername = decUser;
      }
    } catch {
      // Fall back to plaintext
    }
  }

  // Send SMS via Africa's Talking
  let atMessageId: string | null = null;
  let smsStatus = "sent";

  if (atApiKey && atUsername) {
    try {
      const response = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          apiKey: atApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username: atUsername,
          to: thread.parent_phone,
          message: message_body,
          from: process.env.AFRICASTALKING_SENDER_ID || "SKULI",
        }),
      });

      const data = await response.json();
      const recipient = data.SMSMessageData?.Recipients?.[0];

      if (recipient) {
        atMessageId = recipient.messageId;
        smsStatus = recipient.statusCode === 101 ? "sent" : "failed";
      }
    } catch {
      smsStatus = "failed";
    }
  }

  // Insert thread message
  const { data: threadMsg, error: msgError } = await supabase
    .from("thread_messages")
    .insert({
      thread_id: thread.id,
      school_id: userProfile.school_id,
      direction: "outbound",
      body: message_body,
      sender_name: userProfile.full_name,
      at_message_id: atMessageId,
      status: smsStatus,
    })
    .select()
    .single();

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  // Update thread
  await supabase
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString(), is_read: true })
    .eq("id", thread.id);

  // Log in sms_logs
  const smsCostPerUnit = 25;
  const smsCount = Math.ceil(message_body.length / 160);
  await supabase.from("sms_logs").insert({
    school_id: userProfile.school_id,
    recipient_phone: thread.parent_phone,
    message_body,
    message_type: "reply",
    status: smsStatus,
    africa_talking_message_id: atMessageId,
    cost: smsCount * smsCostPerUnit,
    related_entity_type: "thread_message",
    related_entity_id: threadMsg.id,
  });

  return NextResponse.json({ success: true, message_id: threadMsg.id });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/communication/reply/
git commit -m "feat(api): add reply route with SMS sending"
```

---

## Task 7: Update Webhook for Inbound SMS

**Files:**
- Modify: `app/api/webhooks/africas-talking/sms/route.ts`

- [ ] **Step 1: Add inbound SMS handling**

Read the existing file first. The current code only handles delivery status callbacks (checks `data.id` and `data.status`). Add inbound message handling BEFORE the existing status callback logic.

The Africa's Talking inbound SMS payload has: `{ from, to, text, date, id }` where `id` is the AT message ID.

Add this logic after the HMAC verification and before the existing `if (data.id)` block:

```typescript
// Handle inbound SMS (parent reply)
if (data.from && data.text && data.to) {
  const senderPhone = data.from;
  const messageText = data.text;

  // Find student by parent_phone to get school_id
  const { data: students } = await supabase
    .from("students")
    .select("id, school_id, parent_name")
    .eq("parent_phone", senderPhone)
    .eq("is_deleted", false)
    .limit(1);

  if (students && students.length > 0) {
    const student = students[0];
    const schoolId = student.school_id;
    const studentId = student.id;

    // Find or create thread (upsert)
    let threadId: string;
    const { data: existingThread } = await supabase
      .from("message_threads")
      .select("id")
      .eq("school_id", schoolId)
      .eq("parent_phone", senderPhone)
      .single();

    if (existingThread) {
      threadId = existingThread.id;
      // Update thread
      await supabase
        .from("message_threads")
        .update({ last_message_at: new Date().toISOString(), is_read: false, student_id: studentId })
        .eq("id", threadId);
    } else {
      const { data: newThread } = await supabase
        .from("message_threads")
        .insert({
          school_id: schoolId,
          parent_phone: senderPhone,
          student_id: studentId,
        })
        .select("id")
        .single();
      threadId = newThread!.id;
    }

    // Insert inbound message
    await supabase.from("thread_messages").insert({
      thread_id: threadId,
      school_id: schoolId,
      direction: "inbound",
      body: messageText,
      sender_name: student.parent_name || null,
      at_message_id: data.id || null,
      status: "delivered",
    });

    // Notify admins (SCHOOL_ADMIN and BURSAR)
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("school_id", schoolId)
      .in("role", ["SCHOOL_ADMIN", "BURSAR"])
      .eq("is_deleted", false);

    if (admins) {
      const preview = messageText.length > 50 ? messageText.slice(0, 50) + "..." : messageText;
      for (const admin of admins) {
        await supabase.from("in_app_notifications").insert({
          school_id: schoolId,
          recipient_user_id: admin.id,
          title: `New message from ${student.parent_name || senderPhone}`,
          body: preview,
          type: "info",
          related_entity_type: "message_thread",
          related_entity_id: threadId,
        });
      }
    }

    return Response.json({ status: "ok" });
  }

  // No student found — still log but don't create thread
  return Response.json({ status: "ok", note: "no student match" });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/webhooks/africas-talking/sms/route.ts
git commit -m "feat(webhook): handle inbound SMS for two-way messaging"
```

---

## Task 8: Inbox Page

**Files:**
- Create: `app/dashboard/communication/inbox/page.tsx`

- [ ] **Step 1: Create the inbox page**

This is a large file. Create `app/dashboard/communication/inbox/page.tsx` with the following features:

- **Left panel:** Thread list with search input, sorted by last_message_at DESC
  - Each row shows: parent phone (or name if available), student name, last message preview, time, unread badge
  - Search filters by parent_phone or student name
  - Realtime subscription for new inbound messages

- **Right panel:** Conversation view
  - Chat bubbles: outbound (right, amber), inbound (left, surface)
  - Reply input + send button
  - Pre-fill with "Dear {parent_name},"
  - [View Student] link, [Mark as Read] button

Uses React Query for data fetching, Zustand for school state, shadcn/ui components.

API endpoints consumed:
- `GET /api/communication/threads?search=X` — list threads
- `GET /api/communication/threads/[id]/messages` — get messages
- `POST /api/communication/reply` — send reply
- `PATCH /api/communication/threads/[id]` — mark as read

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/communication/inbox/page.tsx
git commit -m "feat(ui): add two-panel SMS inbox page"
```

---

## Task 9: Sidebar Navigation Link

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add Inbox link to Communication children**

In the `NAV_ITEMS` array, find the Communication section. Add "Inbox" as the first child:

```typescript
{
    label: "Communication",
    icon: MessageSquare,
    roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
    children: [
      { label: "Inbox", href: "/dashboard/communication/inbox", icon: Inbox },
      { label: "Send Message", href: "/dashboard/communication/compose", icon: Send },
      { label: "SMS Logs", href: "/dashboard/communication/logs", icon: FileText },
      { label: "Templates", href: "/dashboard/communication/templates", icon: FileStack },
    ],
},
```

Note: `Inbox` icon is already imported from lucide-react in the file.

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(nav): add Inbox link to Communication sidebar"
```

---

## Task 10: Build Verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -i "thread\|inbox\|reply"`
Expected: No errors from new files

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds (pre-existing errors unrelated)

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: resolve any build issues from parent messaging feature"
```
