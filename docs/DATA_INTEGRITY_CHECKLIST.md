# End-to-End Data Integrity Checklist

A pre-launch (and pre-each-major-feature) verification pass. Run on a **staging environment** with a real Supabase project, real Africa's Talking sandbox, real Pesapal sandbox, and a single seeded school with at least:
- 1 SCHOOL_ADMIN
- 1 BURSAR
- 2 TEACHERS (one with no class assignments, one with 2 classes)
- 1 PARENT with a PARENT-portal user account
- 30 students across 2 classes
- 1 current term, 1 academic year
- 1 fee structure (a few thousand UGX per student)
- 1 expense category

Each item is a **trace**: perform the action in the UI, then run the listed SQL/DB checks and confirm the data matches what the UI claimed. Where the UI shows something the DB doesn't, that is a bug — log it in the `data-integrity-findings.md` file (template in §4) and fix before sign-off.

**How to use this.**
1. Run the checklist once before each release.
2. Log time, environment, and seed user in §3.
3. For every "❌" / "⚠️" mark in §4 with a one-line description.
4. Don't sign off the release with open P0/P1 findings.

---

## 1 · High-Value Flows (run these every release)

These three flows exercise ~70% of the codebase: payments, attendance, communication. If they are correct, the system is honest.

### 1.1 · Record a fee payment (Cash)

**Action.** As BURSAR, go to `/dashboard/fees/payments/new`. Pick a student, enter `amount = 100000`, method `cash`, today's date, click Record.

**Expected UI response.**
- Success toast.
- Receipt number visible.
- Redirect to the payment list with the new row.
- Student's balance reduced by 100000 in the student detail view.

**DB trace.**
```sql
-- 1. The payment row
SELECT id, amount, payment_method, status, receipt_number, term_id, received_by_user_id, created_at
FROM fee_payments
ORDER BY created_at DESC LIMIT 1;
-- expect: amount = 100000, payment_method = 'cash', status = 'confirmed',
--         receipt_number LIKE 'SKULI-%', term_id NOT NULL,
--         received_by_user_id = BURSAR's user id

-- 2. The fee account was recalculated
SELECT id, total_expected, total_paid, balance, status
FROM fee_accounts
WHERE student_id = (SELECT student_id FROM fee_payments ORDER BY created_at DESC LIMIT 1)
  AND term_id = (SELECT term_id FROM fee_payments ORDER BY created_at DESC LIMIT 1);
-- expect: total_paid increased by 100000, balance decreased by 100000,
--         status updated (unpaid/partial/paid/overpaid reflects the new balance)

-- 3. The audit log row
SELECT id, action, entity_type, entity_id, user_id, school_id, new_value
FROM audit_logs
WHERE entity_id = (SELECT id FROM fee_payments ORDER BY created_at DESC LIMIT 1);
-- expect: action = 'payment_recorded', entity_type = 'fee_payment',
--         user_id = BURSAR's user id, school_id matches, new_value has amount+receipt

-- 4. The push notification was sent (if the student has a parent with portal)
SELECT id, recipient_user_id, title, body, type, created_at
FROM in_app_notifications
WHERE created_at > now() - interval '5 minutes'
  AND title ILIKE '%Payment Received%';
-- expect: one row per parent whose phone matches the student's parent_phone,
--         body contains the amount and student name

-- 5. The cache was invalidated (observability, not DB)
-- Check the next /api/fees/accounts call returns fresh data
-- by looking for the x-skuli-cache: miss header
```

**Edge cases to re-run.**
- [ ] Payment for a student with **no fee account** yet (should error: "No fee account found for this student. Generate accounts first.").
- [ ] Payment for a student in a **past term** (term_id is the past term, not the current one).
- [ ] Payment with method `mobile_money` and provider `mtn` (validation: provider + phone required).
- [ ] Payment for `0` or negative amount (Zod should reject before insert).
- [ ] Two concurrent payments for the same student (race: does `recalculate_fee_account` produce the correct balance?).

### 1.2 · Take attendance for a class (mix of statuses)

**Action.** As TEACHER, go to `/teacher/attendance`. Pick the class, today's date. Mark 25 students as `present`, 3 as `absent`, 1 as `late`, 1 as `excused`. Submit.

**Expected UI response.**
- Success toast.
- Class list now shows today's attendance.
- Dashboard "absences today" widget shows 3.

**DB trace.**
```sql
-- 1. 30 rows in attendance_records (one per student)
SELECT count(*)
FROM attendance_records
WHERE class_id = '<class-id>' AND date = current_date;
-- expect: 30

-- 2. The audit log
SELECT id, action, new_value
FROM audit_logs
WHERE action = 'attendance_taken'
  AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC LIMIT 1;
-- expect: new_value->>'total' = '30', new_value->>'absent' = '3'

-- 3. Push notifications for the 3 absent students
SELECT count(*)
FROM in_app_notifications
WHERE created_at > now() - interval '5 minutes'
  AND title ILIKE '%Absence Alert%';
-- expect: ≤ 3 (only students whose parent has a portal account get a notification)
-- Verify the count matches: parents with portal account among the 3 absent students
```

**Edge cases to re-run.**
- [ ] Teacher with **no class assignments** (the page should show an empty state, not the full school roster).
- [ ] Teacher attempts to take attendance for a class they don't teach (the API should 403, the page should hide the option).
- [ ] Re-submit attendance for the same date (the upsert with `onConflict: "student_id,date"` should update, not duplicate).
- [ ] Date in the future (should the API reject?).

### 1.3 · Send a bulk SMS to "Defaulters"

**Action.** As BURSAR, go to `/dashboard/communication/compose`. Audience: `Defaulters`. Body: a short message with `{parent_name}`, `{student_name}`, `{balance}`, `{school_name}`. Send.

**Expected UI response.**
- "Sent to N parents" toast where N is the number of defaulters.
- Cost shown.

**DB trace.**
```sql
-- 1. One announcement row
SELECT id, title, body, target_audience, sent_at, sms_cost
FROM announcements
WHERE sent_via LIKE '%sms%'
ORDER BY sent_at DESC LIMIT 1;
-- expect: target_audience = 'defaulters', sms_cost = N × 25 UGX (or actual AT cost)

-- 2. One sms_logs row per recipient
SELECT count(*)
FROM sms_logs
WHERE created_at > now() - interval '5 minutes';
-- expect: equal to N (the recipient count from the toast)

-- 3. No duplicate sends (one per unique parent phone)
SELECT recipient_phone, count(*)
FROM sms_logs
WHERE created_at > now() - interval '5 minutes'
GROUP BY recipient_phone
HAVING count(*) > 1;
-- expect: zero rows

-- 4. The in_app_notifications fan-out (one per parent with portal)
SELECT count(*)
FROM in_app_notifications
WHERE created_at > now() - interval '5 minutes'
  AND type = 'info';
-- expect: equal to the number of defaulters whose phone matches a PARENT user
```

**Edge cases to re-run.**
- [ ] Audience = "All parents" with 30 students (200+ messages — does the request complete? does it tie up a worker? see audit §5.2).
- [ ] Custom phones — one of the numbers is malformed (does the request reject the whole batch or just the bad number?).
- [ ] Spend cap exceeded (the API should 429 with a clean error, not partial delivery).
- [ ] Scheduled send (row goes into `announcements` with `scheduled_status = 'pending'`, no `sms_logs` until the worker picks it up).

---

## 2 · Per-Table Coverage (run once per release, mark each ✅ / ⚠️ / ❌)

Walk every table in `supabase/migrations/0004_*.sql` through `0011_*.sql` and confirm the frontend can:
1. **Read** the data the table holds.
2. **Display** the data the way the schema implies.
3. **Update** the data via a UI flow (or via the API if no UI exists).
4. **Delete** is soft (sets `is_deleted = true`) where applicable.

For each table, the test is:
- Find the page or API route that owns it.
- Perform the read, write, update, delete.
- Verify the row state in the DB.

### 2.1 · Core (`0004_core_tables.sql`)

| Table | UI page | Read test | Write test | Update test | Soft-delete test | Notes |
|---|---|---|---|---|---|---|
| `schools` | `/dashboard/settings/school` | ✅ / ❌ | n/a (no UI write) | ⚠️ | n/a | |
| `users` | `/dashboard/settings/users` | | | | | |
| `classes` | `/dashboard/students/classes` | | | | | |
| `students` | `/dashboard/students` | | | | | |
| `academic_years` | selector on multiple pages | | n/a | | n/a | |
| `terms` | selector on multiple pages | | n/a | | n/a | |
| `class_enrollments` | (derived, no direct UI) | | | | | |
| `class_subjects` | (derived) | | | | | |
| `subjects` | `/dashboard/academics/subjects` | | | | | |
| `staff` | `/dashboard/staff` | | | | | |

### 2.2 · Finance (`0006_finance_tables.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `fee_structures` | `/dashboard/fees/structure` | | | | | |
| `fee_accounts` | `/dashboard/fees/accounts` | | | | n/a (computed) | The page reads from this; writes happen via `recalculate_fee_account` RPC |
| `fee_payments` | `/dashboard/fees/payments` | | | | | The page does its own select — see audit §P4 |
| `fee_discounts` | `/dashboard/fees/discounts` | | | | | |
| `student_discounts` | `/dashboard/fees/discounts` | | | | | |
| `expenses` | `/dashboard/fees/expenses` | | | | | |
| `expense_categories` | `/dashboard/fees/expenses/categories` | | | | | |
| `tuition_payments` | (Pesapal flow) | | (via IPN) | | n/a | The page `/portal/fees` shows this for parents |
| `subscription_invoices` | (billing flow) | | (via IPN) | | n/a | |
| `payroll_batches` | `/dashboard/staff/payroll` | | | | n/a | |
| `payroll_lines` | (detail of above) | | | | n/a | |
| `staff_payment_profiles` | `/dashboard/staff/[id]/payment-profile` | | | | n/a | |

### 2.3 · Grading (`0007_grading_tables.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `grading_scales` | `/dashboard/academics` settings | | | | | |
| `report_cards` | `/dashboard/academics/report-cards` | | (via generate) | | n/a | |

### 2.4 · Attendance + announcements (`0008_attendance_announcements.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `attendance_records` | `/dashboard/attendance`, `/teacher/attendance` | | | | n/a (upsert) | |
| `announcements` | `/dashboard/communication/logs` | | | | | |
| `calendar_events` | `/dashboard/academics/calendar` | | | | | |

### 2.5 · Staff + payroll (`0009_staff_payroll.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `staff` | (above) | | | | | |
| `payroll_*` | (above) | | | | | |

### 2.6 · Communication (`0010_communication.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `message_threads` | `/dashboard/communication/inbox` | | (auto on SMS) | | n/a | |
| `thread_messages` | (detail of above) | | (auto) | | n/a | |
| `sms_logs` | `/dashboard/communication/logs` | | (auto on send) | | n/a | |
| `in_app_notifications` | (topbar bell, all portals) | | (auto) | (mark-read API) | n/a | |
| `push_subscriptions` | (browser push opt-in) | | (browser API) | | n/a | |

### 2.7 · Assets + library + discipline (`0011_*.sql`)

| Table | UI page | Read | Write | Update | Soft-delete | Notes |
|---|---|---|---|---|---|---|
| `assets` | `/dashboard/assets` | | | | | |
| `asset_maintenance` | `/dashboard/assets/maintenance` | | | | | |
| `books` | `/dashboard/library` | | | | | |
| `library_issues` | `/dashboard/library/issues` | | | | | |
| `discipline_records` | `/dashboard/discipline` | | | | | |

---

## 3 · Environment + Run Log

For every run, fill this in. It is the audit trail.

```
Date:              YYYY-MM-DD
Reviewer:          <name>
Environment:       <staging URL>
Supabase project:  <project id>
Seed version:      <commit hash of the seed script>
Time taken:        <hh:mm>

High-value flows (§1):
  1.1 Payment   : ✅ / ⚠️ / ❌   notes: <one line>
  1.2 Attendance: ✅ / ⚠️ / ❌   notes: <one line>
  1.3 Bulk SMS  : ✅ / ⚠️ / ❌   notes: <one line>

Per-table coverage (§2): X / N tables passed

Open P0 findings: <count>
Open P1 findings: <count>

Sign-off:
  <name>     <date>
```

---

## 4 · Findings Log

Use this template per finding. One row per issue.

```
ID:       DI-YYYY-NNN
Severity: P0 (data loss / wrong numbers shown) | P1 (UX bug, data still right) | P2 (cosmetic)
Flow:     <§1.x or §2 table>
Table:    <db table>
UI:       <page or route>
DB:       <column or row that was wrong>
Repro:    <one-paragraph repro steps>
Expected: <what the UI claimed happened>
Actual:   <what the DB shows>
Fix:      <link to PR>
Verified: <date verified by>
```

Keep a running `data-integrity-findings.md` in the repo with this format. CI fails the release if any P0 is open.

---

## 5 · Pre-launch gate (must pass before first production school)

- [ ] All 3 high-value flows in §1 pass.
- [ ] All 10 "high-traffic" tables in §2 (the ones parents and school admins touch daily) pass: `students`, `fee_accounts`, `fee_payments`, `attendance_records`, `marks`, `report_cards`, `announcements`, `sms_logs`, `in_app_notifications`, `message_threads`.
- [ ] RLS verified: try to read another school's data as a SCHOOL_ADMIN → expect zero rows. Try to write → expect 403.
- [ ] Rate limit verified: hammer `/api/communication/send` 11 times in 60s → expect 429 on the 11th.
- [ ] Cache verified: hit a read endpoint twice, check `x-skuli-cache: hit` on the second.
- [ ] Audit log verified: every write in §1 produced exactly one `audit_logs` row.
- [ ] Push verified: every parent-portal-eligible recipient of a payment got one `in_app_notifications` row.
- [ ] Webhook verified: a Pesapal sandbox IPN with a verified amount < expected → tuition payment stays PENDING, audit row written.
- [ ] Spend cap verified: bulk SMS beyond the cap → 429, no partial sends.

---

## 6 · Per-release gate (run on every release branch)

- [ ] All 3 high-value flows in §1.
- [ ] All tables in §2 that the release changed.
- [ ] No open P0 findings from the previous run.
- [ ] Sign-off in §3.

---

## 7 · What this checklist does NOT cover

- Performance under load (separate load test plan needed).
- Multi-region failover.
- Disaster recovery / backup restore.
- Long-running migrations or schema changes (separate runbook).
- Security review of the codebase (separate security audit, run on a quarterly cadence).

Add a load test in the same staging environment. A 30-minute k6 run that hits `/api/fees/accounts` and `/api/attendance` at 50 RPS for 10 minutes will catch the cache-invalidation thundering herd (audit §P3) and the cache-invalidation correctness. If p99 latency on the read endpoints exceeds 500ms during the test, the tag-based cache refactor (audit Strategy B) is the next priority.
