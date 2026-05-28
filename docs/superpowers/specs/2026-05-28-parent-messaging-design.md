# Two-Way Parent Messaging (SMS Inbox) — Design Spec

**Date:** 2026-05-28
**Step:** 10
**Status:** Approved

## Overview

A two-way SMS messaging system that allows parents to reply to school SMS messages and schools to view and respond to parent messages in a WhatsApp-style inbox.

## Architecture

**Approach:** DB-Centric with RLS
**Pattern:** Matches existing communication features (compose, logs)

### Components

1. **Database** — `message_threads` + `thread_messages` tables with RLS
2. **Inbox UI** — `/dashboard/communication/inbox` two-panel layout
3. **Webhook Update** — Handle inbound SMS in existing AT webhook
4. **Reply API** — Send SMS replies + log in thread

---

## Database Schema

### `message_threads`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| school_id | uuid | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| parent_phone | text | NOT NULL |
| student_id | uuid | FK → students(id), nullable |
| last_message_at | timestamptz | NOT NULL, default now() |
| is_read | boolean | NOT NULL, default false |
| is_deleted | boolean | NOT NULL, default false |

**Constraint:** `UNIQUE(school_id, parent_phone)`

### `thread_messages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| thread_id | uuid | NOT NULL, FK → message_threads(id) ON DELETE CASCADE |
| school_id | uuid | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| direction | text | NOT NULL, CHECK IN ('inbound', 'outbound') |
| body | text | NOT NULL |
| sender_name | text | nullable |
| at_message_id | text | nullable |
| status | text | NOT NULL, default 'delivered', CHECK IN ('sent', 'delivered', 'failed') |
| sent_at | timestamptz | NOT NULL, default now() |
| is_deleted | boolean | NOT NULL, default false |

### Indexes

```sql
CREATE INDEX idx_threads_last_msg ON message_threads(school_id, last_message_at DESC)
  WHERE is_deleted = false;

CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, sent_at)
  WHERE is_deleted = false;
```

### RLS Policies

```sql
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_manage_threads" ON message_threads FOR ALL
  USING (school_id = get_user_school_id());

CREATE POLICY "school_manage_thread_msgs" ON thread_messages FOR ALL
  USING (school_id = get_user_school_id());
```

---

## Inbox Page — `/dashboard/communication/inbox`

### Layout

**Two-panel layout (WhatsApp Web style):**

- **Left panel (thread list):**
  - Search input (filters by parent name or phone)
  - Thread rows: Parent name (or phone) | Student name | Last message preview | Time | Unread badge
  - Sorted by `last_message_at DESC`
  - Realtime subscription via `supabase.channel()` for new inbound messages

- **Right panel (conversation):**
  - Chat-style message bubbles:
    - Outbound: right-aligned, amber background
    - Inbound: left-aligned, surface background
  - Reply text input + send button
  - Pre-fill reply: "Dear {parent_name},"
  - [View Student] link → student profile
  - [Mark as Read] button

### Sidebar Nav

- Add unread count badge to "Communication" nav item in sidebar

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/communication/threads` | List threads with last message preview |
| GET | `/api/communication/threads/[id]/messages` | Get messages for thread |
| POST | `/api/communication/reply` | Send reply SMS + insert thread_message |
| PATCH | `/api/communication/threads/[id]` | Mark thread as read |

---

## Webhook Update — `/api/webhooks/africas-talking/sms/route.ts`

### Current Behavior

The existing route handles delivery status callbacks (Success/Sent/Failed) by updating `sms_logs` records.

### New Behavior

Add inbound SMS handling:

1. **Detect inbound message:** Check if payload has `text` and `from` fields (inbound) vs `id` and `status` (delivery callback)
2. **Look up school:** Find student by `parent_phone` matching `from` number → get `school_id`
3. **Find or create thread:** Upsert `message_threads` for `(school_id, sender_phone)`
4. **Insert message:** Add to `thread_messages` with `direction='inbound'`
5. **Update thread:** Set `last_message_at=now()`, `is_read=false`
6. **Notify admins:** Create `in_app_notifications` for all SCHOOL_ADMIN and BURSAR users of that school

### Africa's Talking Inbound Payload

```json
{
  "from": "+256700000000",
  "to": "SKULI",
  "text": "Message content",
  "date": "2026-05-28 10:30:00",
  "id": "ATXid_12345"
}
```

---

## Reply API — `/api/communication/reply/route.ts`

### Request

```typescript
POST { thread_id: string, body: string }
```

### Logic

1. Look up thread → get `school_id`, `parent_phone`
2. Get school AT credentials (same pattern as existing `/api/communication/send`)
3. Send SMS via Africa's Talking to `parent_phone`
4. Insert `thread_message` with `direction='outbound'`
5. Update `thread.last_message_at`, `thread.is_read=true`
6. Log in `sms_logs`

### Response

```json
{ "success": true, "message_id": "uuid" }
```

---

## File Structure

```
supabase/migrations/
  00023_message_threads.sql

app/api/communication/
  threads/route.ts                  -- GET list threads
  threads/[id]/route.ts             -- PATCH mark as read
  threads/[id]/messages/route.ts    -- GET messages for thread
  reply/route.ts                    -- POST send reply

app/api/webhooks/africas-talking/
  sms/route.ts                      -- UPDATE to handle inbound

app/dashboard/communication/
  inbox/page.tsx                    -- Two-panel inbox UI

components/dashboard/sidebar.tsx    -- Add unread badge
```
