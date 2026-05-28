# Fee Discounts / Scholarships — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** Step 6 of Skuli OS fee system — discount types, student discount assignments, fee account recalculation integration

---

## Overview

Add a fee discount/scholarship system that allows school administrators to define discount types (bursaries, staff child discounts, sibling discounts, etc.) and apply them to individual students. Discounts automatically reduce `total_expected` on fee accounts during generation and recalculation.

## Architecture: DB-Centric

All discount subtraction logic lives in the `recalculate_fee_account()` DB function. API routes and edge functions call this function rather than reimplementing the logic. This ensures consistent behavior across all recalculation paths.

---

## 1. Database Schema

### Migration: `supabase/migrations/00020_fee_discounts.sql`

**Enum:** Add `discount_type` to existing `00001_create_enums.sql`:
```sql
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
```

**New Tables:**

`fee_discounts` — defines discount types:
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| school_id | uuid FK → schools | ON DELETE CASCADE |
| name | text | "Bursary", "Staff Child", "Sibling Discount" |
| discount_type | discount_type | DEFAULT 'percentage' |
| value | numeric | 50 = 50% or UGX 50,000 |
| max_amount | numeric | Cap for percentage discounts (nullable) |
| is_recurring | boolean | DEFAULT true — reapplies each term |
| created_at | timestamptz | DEFAULT now() |
| is_deleted | boolean | DEFAULT false |

`student_discounts` — assigns discounts to students:
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| school_id | uuid FK → schools | ON DELETE CASCADE |
| student_id | uuid FK → students | ON DELETE CASCADE |
| discount_id | uuid FK → fee_discounts | ON DELETE CASCADE |
| term_id | uuid FK → terms | Nullable — null = all terms |
| approved_by | uuid FK → users | Nullable |
| note | text | Nullable |
| created_at | timestamptz | DEFAULT now() |
| is_deleted | boolean | DEFAULT false |
| UNIQUE | (student_id, discount_id, term_id) | |

**RLS Policies:**
- `fee_discounts`: Admin/Bursar full access within school (`school_id = get_user_school_id()`)
- `student_discounts`: Admin/Bursar full access within school; Parents read-only for own children

### Updated DB Functions (in migration `00020_fee_discounts.sql`)

Use `CREATE OR REPLACE` to update the existing functions. The original `00005_create_functions.sql` is not modified.

**`recalculate_fee_account()`** — After computing base `total_expected` from fee_structures:
1. Query `student_discounts` joined with `fee_discounts` for the student/term
2. For percentage discounts: `amount * (value / 100)`, capped at `max_amount` if set
3. For fixed_amount discounts: `value` directly
4. Sum all applicable discounts, subtract from `total_expected`
5. Ensure `total_expected >= 0`

**`create_fee_accounts_for_term()`** — Same discount subtraction when batch-creating accounts.

**Edge function `fee-account-recalculate`** — Call the DB function instead of reimplementing logic.

---

## 2. Discount Management Page

**File:** `app/dashboard/fees/discounts/page.tsx`

**UI Pattern:** Matches existing fee pages (react-query, custom table, navy theme).

**Table columns:** Name | Type | Value | Max Amount | Recurring | Students Applied (count) | Actions

**Actions per row:** Edit, View Students, Delete (soft delete)

**Create/Edit Modal (Dialog):**
- Name (text input, required)
- Discount Type (Select: percentage / fixed_amount)
- Value (number input — percentage or UGX amount)
- Max Amount (optional, only for percentage type)
- Recurring (Switch toggle)

**View Students Drawer (Sheet):**
- Lists students with this discount: Student Name | Class | Term | Applied Date | Note
- Remove button per row (soft-deletes `student_discounts` record)
- Shows total count

**API Routes:**
- `app/api/fees/discounts/route.ts` — GET (list with counts), POST (create), PATCH (update), DELETE (soft-delete)
- `app/api/fees/student-discounts/route.ts` — GET (filter by student/discount), POST (apply), DELETE (remove)

---

## 3. Apply Discount to Student

**Locations:**
1. Student page fee tab (`app/dashboard/students/[id]/page.tsx`)
2. Fee accounts page (`app/dashboard/fees/accounts/page.tsx`)

**Apply Discount Dialog:**
- Discount selector: Dropdown of active discount types
- Term selector: Specific term or "All Terms" (for recurring discounts)
- Note textarea (optional)
- On submit: Insert `student_discounts` record, call `recalculate_fee_account()` for affected terms

**Student Page Fee Tab:**
- `[Apply Discount]` button next to `[Record Payment]`
- Applied discounts list below stat cards (name, type, value, term, remove button)

**Fee Accounts Page:**
- Action button per row → opens Apply Discount dialog pre-filled with student

---

## 4. Portal View

**File:** `app/portal/fees/page.tsx`

**Changes:** Add "Discounts" section below fee account summary:
- List of applied discounts for current term
- Columns: Discount Name | Type | Value | Term
- Read-only (no actions for parents)

---

## 5. Type Updates

**`types/index.ts`** — Add:
```typescript
export type DiscountType = 'percentage' | 'fixed_amount';

export interface FeeDiscount {
  id: string;
  school_id: string;
  name: string;
  discount_type: DiscountType;
  value: number;
  max_amount: number | null;
  is_recurring: boolean;
  created_at: string;
  is_deleted: boolean;
}

export interface StudentDiscount {
  id: string;
  school_id: string;
  student_id: string;
  discount_id: string;
  term_id: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: string;
  is_deleted: boolean;
  // Joined fields
  discount?: FeeDiscount;
  student_name?: string;
  student_class?: string;
}
```

**`types/database.ts`** — Add `fee_discounts` and `student_discounts` table types.

---

## 6. Validation

**`lib/validations/fees.ts`** — Add:
```typescript
export const createDiscountSchema = z.object({
  name: z.string().min(1),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  value: z.number().positive(),
  max_amount: z.number().positive().nullable().optional(),
  is_recurring: z.boolean().default(true),
});

export const applyDiscountSchema = z.object({
  student_id: z.string().uuid(),
  discount_id: z.string().uuid(),
  term_id: z.string().uuid().nullable(),
  note: z.string().optional(),
});
```

---

## Files Modified

| File | Change |
|---|---|
| `supabase/migrations/00001_create_enums.sql` | Add `discount_type` enum |
| `supabase/migrations/00020_fee_discounts.sql` | New — tables + RLS + updated functions |
| `supabase/functions/fee-account-recalculate/index.ts` | Update to use DB function |
| `app/api/fees/discounts/route.ts` | New — discount CRUD |
| `app/api/fees/student-discounts/route.ts` | New — apply/remove discounts |
| `app/api/fees/generate-accounts/route.ts` | Call `recalculate_fee_account()` after creating accounts |
| `app/dashboard/fees/discounts/page.tsx` | New — discount management page |
| `app/dashboard/students/[id]/page.tsx` | Add Apply Discount button + discounts list in fees tab |
| `app/dashboard/fees/accounts/page.tsx` | Add Apply Discount action per row |
| `app/portal/fees/page.tsx` | Add discounts section |
| `types/index.ts` | Add FeeDiscount, StudentDiscount types |
| `types/database.ts` | Add table types |
| `lib/validations/fees.ts` | Add discount schemas |
| `components/dashboard/sidebar.tsx` | Add "Discounts" link under Fees |
