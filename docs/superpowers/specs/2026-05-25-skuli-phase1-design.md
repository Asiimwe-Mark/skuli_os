# SKULI — Phase 1 Design Spec

**Date:** 2026-05-25
**Status:** Approved
**Scope:** Foundation, Database Schema, Auth & Onboarding

---

## Overview

SKULI is a premium School Management & Fee Collection SaaS platform for Ugandan private schools. Phase 1 covers the complete foundation: project scaffolding, full database schema (all 20+ tables), and the authentication/onboarding system.

**Build approach:** Database-First. All Supabase migrations are written and applied before any UI code. TypeScript types are generated from the schema. Then auth + onboarding UI is built on top of the solid data layer.

---

## 1. Project Foundation & Tooling

**Stack:** Next.js 16 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn/ui

**Initialization sequence:**
1. `npx create-next-app@latest skuli` with TypeScript, Tailwind, App Router, `src/` directory
2. Install all dependencies in one batch (supabase-js, zustand, tanstack-query, react-hook-form, zod, framer-motion, recharts, react-pdf, pino, etc.)
3. Configure `tailwind.config.ts` with SKULI design tokens (colors, fonts)
4. Set up `shadcn/ui` with custom theme
5. Create `.env.local` template
6. Write root layout with fonts (Plus Jakarta Sans + Fraunces) and global providers

**Directory structure** follows the spec: `/app`, `/components`, `/lib`, `/store`, `/types`, `/supabase`

**TypeScript config:** `strict: true`, `noUncheckedIndexedAccess: true`, path aliases (`@/components`, `@/lib`, etc.)

---

## 2. Database Schema & Migrations

**Migration strategy:** Numbered SQL files in `/supabase/migrations/`, applied via Supabase dashboard SQL editor or CLI.

**Migration files (in order):**

| # | File | Contents |
|---|------|----------|
| 001 | `extensions.sql` | uuid-ossp, pgcrypto |
| 002 | `enums.sql` | All custom types (roles, statuses, etc.) |
| 003 | `schools.sql` | schools table |
| 004 | `users.sql` | profiles table (extends auth.users) |
| 005 | `academic.sql` | academic_years, terms |
| 006 | `classes_subjects.sql` | classes, subjects, class_subjects |
| 007 | `students.sql` | students, class_enrollments |
| 008 | `fees.sql` | fee_structures, fee_accounts, fee_payments |
| 009 | `academics.sql` | marks, report_cards |
| 010 | `attendance.sql` | attendance_records |
| 011 | `communication.sql` | announcements, sms_logs |
| 012 | `staff.sql` | staff, payroll_records |
| 013 | `billing.sql` | subscription_invoices |
| 014 | `audit.sql` | audit_logs |
| 015 | `rls_policies.sql` | All Row-Level Security policies |
| 016 | `db_functions.sql` | Computed columns, triggers, helper functions |

**Key design decisions:**

- **Soft delete** via `is_deleted` boolean (default false) on every table. All queries default to `WHERE is_deleted = false`.
- **`school_id`** on every table (except `schools`). Tenant isolation key for RLS.
- **Enums as PostgreSQL types**, not check constraints.
- **`fee_accounts` auto-recalculation** via DB trigger on `fee_payments` insert/update. Trigger function updates `total_expected`, `total_paid`, `balance`, `status`.
- **`audit_logs`** capture old/new JSONB values. A shared trigger function applies to any table.
- **Indexes** on all foreign keys, plus composite: `(school_id, term_id)`, `(school_id, student_id)`, `(school_id, is_deleted)`.
- **RLS policies** in a separate migration. Every table: `SELECT` filtered by `school_id` via helper, `INSERT/UPDATE/DELETE` filtered by role permissions.

**DB helper functions** (in `public` schema to avoid conflicts with Supabase's `auth` schema):
- `public.user_school_id()` — current user's school_id from profiles (used in RLS policies)
- `public.user_role()` — current user's role (used in RLS policies)
- `public.recalculate_fee_account()` — trigger on fee_payments
- `public.generate_receipt_number(school_id)` — sequence-based receipt number
- `public.set_updated_at()` — auto-set updated_at on update

---

## 3. Auth & Onboarding Flow

**Auth method:** Supabase Auth, email + password primary. Magic link for password reset and parent portal.

### Onboarding (`/onboard` — unauthenticated, 4-step wizard)

| Step | Content | Validation |
|------|---------|------------|
| 1 | School details (name, address, district dropdown, phone, email, type) | Zod inline |
| 2 | Logo upload (drag & drop → Supabase Storage) | File type/size |
| 3 | Admin account (name, email, password, confirm) | Zod + password match |
| 4 | Plan selection (Starter/Growth/Pro) — trial or Flutterwave redirect | Required |

**Server action at `/api/onboard`** (atomic):
1. Create auth user via `supabase.auth.signUp()`
2. Insert school record
3. Insert profile record (auth user → school, role=SCHOOL_ADMIN)
4. Insert default academic_year ("2026") + current term
5. Send welcome email via Resend
6. Redirect to `/dashboard`

### Login (`/login`)

- Email + password → `supabase.auth.signInWithPassword()`
- Forgot password → `supabase.auth.resetPasswordForEmail()`
- Role-aware redirect:

| Role | Redirect |
|------|----------|
| SCHOOL_ADMIN / BURSAR | `/dashboard` |
| TEACHER | `/dashboard/academics/marks` |
| PARENT | `/portal` |
| SUPER_ADMIN | `/admin` |

### Middleware (`middleware.ts`)

- Reads session from Supabase cookie on every request
- Unauthenticated → redirect to `/login` (except `/`, `/login`, `/onboard`, `/api/webhooks/*`)
- Role-based route protection:
  - TEACHER blocked from `/dashboard/fees/*`, `/dashboard/settings/*`
  - PARENT blocked from `/dashboard/*` → redirect to `/portal`
  - SUPER_ADMIN can access `/admin/*` and `/dashboard/*`

### Key Decisions

- **Profile table** stores role + school_id, linked to `auth.users` via FK on `id`. Trigger on auth.users insert creates blank profile; onboard flow sets role + school_id.
- **Session management:** Supabase built-in cookie sessions. No custom JWT.
- **Onboarding is a server action** for atomicity.
- **Logo upload:** client-side to Supabase Storage, URL passed to server action. Bucket RLS: authenticated upload, public read.
- **No email verification for trial** (friction reduction). Can enforce later for paid plans.

---

## Build Order (Phase 1)

1. Initialize Next.js project with all dependencies
2. Configure Tailwind + shadcn/ui with SKULI design tokens
3. Write `.env.local` template
4. Write all 16 migration files
5. Apply migrations to Supabase
6. Generate TypeScript types
7. Build Supabase client utilities (`/lib/supabase/`)
8. Build shared utilities (`/lib/utils/`)
9. Build Zustand stores (`/store/`)
10. Build root layout with providers
11. Build landing page (`/`)
12. Build onboarding wizard (`/onboard`)
13. Build login page (`/login`)
14. Build auth middleware (`middleware.ts`)
15. Verify: full auth flow end-to-end
