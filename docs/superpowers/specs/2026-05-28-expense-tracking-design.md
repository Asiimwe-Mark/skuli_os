# Expense Tracking — Design Spec

**Date**: 2026-05-28
**Step**: 7 — Expense Tracking
**Status**: Approved

## Overview

Add expense tracking to Skuli OS's financial module. Bursars and school admins can record, categorize, and analyze school expenses alongside fee income. Includes a P&L (Profit & Loss) report for term-level financial statements.

## Architecture

### Approach

Single expense dashboard page + separate category management page. Both under the Fees section in the sidebar. Data fetching via React Query + Supabase browser client (consistent with all existing fee pages). PDF generation server-side via `@react-pdf/renderer`.

### File Structure

```
supabase/migrations/
  00021_expenses.sql              # DB migration

app/api/fees/expenses/
  route.ts                        # CRUD for expenses
  categories/route.ts             # CRUD for categories
  export/route.ts                 # CSV export
  pl-report/route.ts              # P&L PDF generation

app/dashboard/fees/expenses/
  page.tsx                        # Expense dashboard (KPIs, charts, table)
  categories/page.tsx             # Category CRUD page

lib/pdf/
  pl-report.tsx                   # P&L report PDF component

lib/validations/
  fees.ts                         # Extend with expense schemas
```

## Database Layer

### Migration: `00021_expenses.sql`

**New enum type:**

```sql
CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank', 'mobile_money', 'cheque');
```

**`expense_categories` table:**

| Column     | Type      | Constraints                                  |
|------------|-----------|----------------------------------------------|
| id         | uuid      | PRIMARY KEY, DEFAULT gen_random_uuid()       |
| school_id  | uuid      | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| name       | text      | NOT NULL                                     |
| is_deleted | boolean   | NOT NULL DEFAULT false                       |

**`expenses` table:**

| Column          | Type                   | Constraints                                  |
|-----------------|------------------------|----------------------------------------------|
| id              | uuid                   | PRIMARY KEY, DEFAULT gen_random_uuid()       |
| school_id       | uuid                   | NOT NULL, FK → schools(id) ON DELETE CASCADE |
| category_id     | uuid                   | FK → expense_categories(id), nullable        |
| term_id         | uuid                   | FK → terms(id), nullable                     |
| description     | text                   | NOT NULL                                     |
| amount          | numeric                | NOT NULL                                     |
| expense_date    | date                   | NOT NULL                                     |
| payment_method  | expense_payment_method |                                              |
| receipt_number  | text                   |                                              |
| recorded_by     | uuid                   | FK → users(id), nullable                     |
| notes           | text                   |                                              |
| created_at      | timestamptz            | NOT NULL DEFAULT now()                       |
| is_deleted      | boolean                | NOT NULL DEFAULT false                       |

### RLS Policies

Following the established 3-pattern approach (team memory: `rls-policy-role-checks.md`):

```sql
-- Expense categories
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_expense_categories" ON expense_categories
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expense_cats" ON expense_categories
  FOR ALL USING (school_id = get_user_school_id());

-- Expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_expenses" ON expenses
  FOR ALL USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_manage_expenses" ON expenses
  FOR ALL USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
  );
```

### Indexes

```sql
CREATE INDEX idx_expenses_date ON expenses(school_id, expense_date, term_id)
  WHERE is_deleted = false;
```

## API Routes

### `GET/POST/PATCH/DELETE /api/fees/expenses`

**GET** — List expenses with filters:
- Query params: `term_id`, `category_id`, `date_from`, `date_to`
- Joins: `expense_categories(name)`, `users!recorded_by(full_name)`
- Order: `expense_date DESC`
- Role: `SCHOOL_ADMIN`, `BURSAR`, `SUPER_ADMIN`

**POST** — Create expense:
- Validates with `createExpenseSchema`
- Auto-sets `recorded_by` from authenticated user
- Returns created expense with joins

**PATCH** — Update expense fields

**DELETE** — Soft delete (`is_deleted = true`)

### `GET/POST/PATCH/DELETE /api/fees/expenses/categories`

Standard CRUD for expense categories. DELETE returns 409 if category has linked expenses. Soft-deletes the category; linked expenses get `category_id` set to NULL.

### `GET /api/fees/expenses/export`

CSV export with filters: `term_id`, `date_from`, `date_to`. Returns `text/csv` with columns: Date, Category, Description, Amount, Method, Receipt #, Recorded By, Notes.

### `GET /api/fees/pl-report`

P&L report PDF. Accepts `term_id`. Generates PDF server-side using `renderToBuffer()`. Returns `application/pdf` with `Content-Disposition: attachment`.

### Validation Schema (`lib/validations/fees.ts`)

```ts
export const createExpenseSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  term_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expense_date: z.string().min(1, "Date is required"),
  payment_method: z.enum(["cash", "bank", "mobile_money", "cheque"]),
  receipt_number: z.string().optional(),
  notes: z.string().optional(),
});
```

## Frontend Pages

### Expense Dashboard (`app/dashboard/fees/expenses/page.tsx`)

**Pattern**: `"use client"`, React Query, Zustand store (`useSchoolStore`), Framer Motion, shadcn/ui — identical to fees/reports page.

**KPI Cards** (3-column grid):
1. **Total Income** — sum of confirmed `fee_payments` for current term (green)
2. **Total Expenses** — sum of `expenses` for current term (red)
3. **Net Surplus/Deficit** — income minus expenses (amber/green if surplus, red if deficit)

**Charts** (2-column: `2fr 1fr`):
1. **Bar Chart** (Recharts `BarChart`) — Income vs Expenses by week for current term. Green bars = income, red bars = expenses. Weeks derived from term date range.
2. **Donut Chart** (Recharts `PieChart` with `innerRadius`) — Expenses grouped by category. Color palette: `['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6']`.

**Expense Table**:
- Columns: Date, Category, Description, Amount, Method, Receipt #, Recorded By
- Search by description, filter by category dropdown
- Pagination (20 per page)
- Framer Motion row stagger

**Action Buttons**:
- **Add Expense** → Dialog with React Hook Form + Zod (`zodResolver(createExpenseSchema) as any`)
- **Export CSV** → fetches `/api/fees/expenses/export?term_id=...`, triggers `saveAs()`
- **P&L Report** → fetches `/api/fees/pl-report?term_id=...`, downloads PDF blob

### Categories Page (`app/dashboard/fees/expenses/categories/page.tsx`)

Simple CRUD table: Name | # of Expenses | Actions (edit, delete).

- Add via dialog with single `name` field
- Edit via dialog (rename)
- Delete with AlertDialog confirmation. Warns if category has expenses. Sets `category_id = NULL` on linked expenses.
- Roles: `SCHOOL_ADMIN`, `BURSAR`, `SUPER_ADMIN`

### Sidebar Navigation

Add under the existing Fees section:

```
Fees
  ├── Structure
  ├── Discounts
  ├── Expenses          ← new (href: /dashboard/fees/expenses)
  │   └── Categories    ← new (href: /dashboard/fees/expenses/categories)
  ├── Accounts
  ├── Payments
  ...
```

Roles: `SCHOOL_ADMIN`, `BURSAR`, `SUPER_ADMIN`

## P&L Report PDF (`lib/pdf/pl-report.tsx`)

**Library**: `@react-pdf/renderer`, `renderToBuffer()` in API route.

**Page**: A4 portrait, Helvetica font.

**Layout**:

1. **Header**: School name, "Income & Expenditure Statement", term name + academic year, date generated

2. **Income section** (table):
   - Rows: fee payments grouped by fee structure name + class
   - Source: `fee_payments` joined to `fee_accounts` joined to `class_enrollments` and `classes`
   - Subtotal row: total income

3. **Expenditure section** (table):
   - Rows: expenses grouped by category name
   - Source: `expenses` joined to `expense_categories`
   - Subtotal row: total expenses

4. **Net row**: Bold "Net Surplus" or "Net Deficit" = income - expenses

5. **Footer**: "Signed: ____________________ (Bursar)", "Date: ____________________"

**Colors**: Navy header (#0A1628), amber accent (#F5A623), consistent with existing PDFs.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payment method enum | Separate `expense_payment_method` enum | Decouples expenses from fee payments — different domains |
| P&L generation | Server-side (`renderToBuffer`) | Formal financial statement, works on mobile, can be emailed |
| Category management | Separate page under Expenses | Clean CRUD, not cramped in a tab, matches discounts page pattern |
| Categories RLS | `school_id = get_user_school_id()` only | Any school member can read categories; no extra role check needed |
| SUPER_ADMIN policy | Added to both tables | Required per team memory `rls-policy-role-checks.md` |
| Expense `updated_at` | Omitted | Matches `fee_discounts` pattern for lightweight entities |

## Scope

**In scope:**
- DB migration with RLS + indexes
- Expense CRUD API
- Category CRUD API
- CSV export endpoint
- P&L report PDF endpoint + component
- Expense dashboard page (KPIs, charts, table, add modal, export, P&L)
- Categories CRUD page
- Sidebar navigation update
- Zod validation schemas

**Out of scope:**
- Budget planning or budget vs actuals comparison
- Multi-currency support
- Approval workflows for expenses
- Recurring expense templates
- Attachment/receipt image upload
