# Fee Discounts / Scholarships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fee discount/scholarship system that lets admins define discount types and apply them to students, with automatic recalculation of fee accounts.

**Architecture:** DB-Centric — all discount subtraction logic lives in `recalculate_fee_account()` via `CREATE OR REPLACE`. API routes and edge functions call the DB function. This ensures consistent behavior across all recalculation paths.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), react-query, shadcn/ui, Zod, Tailwind CSS

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/00001_create_enums.sql` | Add `discount_type` enum |
| `supabase/migrations/00020_fee_discounts.sql` | Tables, RLS, updated DB functions |
| `types/index.ts` | Add `FeeDiscount`, `StudentDiscount` interfaces |
| `lib/validations/fees.ts` | Add `createDiscountSchema`, `applyDiscountSchema` |
| `app/api/fees/discounts/route.ts` | Discount type CRUD (GET/POST/PATCH/DELETE) |
| `app/api/fees/student-discounts/route.ts` | Apply/remove student discounts (GET/POST/DELETE) |
| `app/api/fees/generate-accounts/route.ts` | Call `recalculate_fee_account()` after insert |
| `supabase/functions/fee-account-recalculate/index.ts` | Replace inline logic with DB function call |
| `app/dashboard/fees/discounts/page.tsx` | Discount management page |
| `components/fees/apply-discount-dialog.tsx` | Shared apply discount dialog |
| `app/dashboard/students/[id]/page.tsx` | Add discount section to fees tab |
| `app/dashboard/fees/accounts/page.tsx` | Add apply discount action per row |
| `app/portal/fees/page.tsx` | Show discounts in portal |
| `components/dashboard/sidebar.tsx` | Add "Discounts" nav link |

---

### Task 1: Database Migration — Enum + Tables + RLS

**Files:**
- Modify: `supabase/migrations/00001_create_enums.sql`
- Create: `supabase/migrations/00020_fee_discounts.sql`

- [ ] **Step 1: Add `discount_type` enum to enums file**

Append to `supabase/migrations/00001_create_enums.sql`:

```sql
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
```

- [ ] **Step 2: Create migration file with tables and RLS**

Create `supabase/migrations/00020_fee_discounts.sql`:

```sql
-- =============================================================================
-- SKULI SaaS: Fee Discounts / Scholarships
-- Migration 00020
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. fee_discounts — defines discount types per school
-- ---------------------------------------------------------------------------
CREATE TABLE fee_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  discount_type discount_type NOT NULL DEFAULT 'percentage',
  value         numeric NOT NULL,
  max_amount    numeric,
  is_recurring  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_fee_discounts_school ON fee_discounts(school_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 2. student_discounts — assigns discounts to students
-- ---------------------------------------------------------------------------
CREATE TABLE student_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  discount_id   uuid NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
  term_id       uuid REFERENCES terms(id),
  approved_by   uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean NOT NULL DEFAULT false,
  UNIQUE (student_id, discount_id, term_id)
);

CREATE INDEX idx_student_discounts_student ON student_discounts(student_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_discount ON student_discounts(discount_id) WHERE is_deleted = false;
CREATE INDEX idx_student_discounts_term ON student_discounts(term_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 3. RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;

-- fee_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_discounts" ON fee_discounts FOR ALL
  USING (school_id = get_user_school_id());

-- student_discounts: Admin/Bursar full access within school
CREATE POLICY "school_manage_student_discounts" ON student_discounts FOR ALL
  USING (school_id = get_user_school_id());

-- student_discounts: Parents read-only for own children
CREATE POLICY "parent_read_student_discounts" ON student_discounts FOR SELECT
  USING (
    get_user_role() = 'PARENT'
    AND student_id IN (
      SELECT s.id FROM students s
      WHERE s.parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
        AND s.is_deleted = false
    )
  );

-- ---------------------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fee_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Create updated `recalculate_fee_account()` function**

Append to `supabase/migrations/00020_fee_discounts.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 5. Updated recalculate_fee_account() — subtracts applicable discounts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account fee_accounts%ROWTYPE;
    v_total_expected numeric;
    v_total_paid numeric;
    v_total_discount numeric;
    v_balance numeric;
    v_status fee_account_status;
BEGIN
    -- Fetch the account
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- Calculate total_expected from fee_structures for this term/class
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_total_expected
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id = v_account.term_id
      AND fs.school_id = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- Calculate total discount applicable to this student/term
    SELECT COALESCE(SUM(
      CASE
        WHEN fd.discount_type = 'percentage' THEN
          LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
        ELSE fd.value
      END
    ), 0)
    INTO v_total_discount
    FROM student_discounts sd
    JOIN fee_discounts fd ON fd.id = sd.discount_id
    WHERE sd.student_id = v_account.student_id
      AND (sd.term_id = v_account.term_id OR sd.term_id IS NULL)
      AND sd.is_deleted = false
      AND fd.is_deleted = false;

    -- Apply discount, ensure non-negative
    v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

    -- Calculate total_paid from confirmed fee_payments
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status = 'confirmed'
      AND fp.is_deleted = false;

    -- Calculate balance
    v_balance := v_total_expected - v_total_paid;

    -- Determine status
    IF v_balance = 0 AND v_total_expected > 0 THEN
        v_status := 'paid';
    ELSIF v_balance > 0 AND v_total_paid > 0 THEN
        v_status := 'partial';
    ELSIF v_balance < 0 THEN
        v_status := 'overpaid';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- Update the account
    UPDATE fee_accounts
    SET total_expected = v_total_expected,
        total_paid = v_total_paid,
        balance = v_balance,
        status = v_status
    WHERE id = p_account_id;
END;
$$;
```

- [ ] **Step 4: Create updated `create_fee_accounts_for_term()` function**

Append to `supabase/migrations/00020_fee_discounts.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 6. Updated create_fee_accounts_for_term() — subtracts discounts on creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_fee_accounts_for_term(
    p_school_id uuid,
    p_term_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int := 0;
    v_rec record;
    v_academic_year_id uuid;
    v_total_expected numeric;
    v_total_discount numeric;
BEGIN
    -- Get the academic year for this term
    SELECT academic_year_id INTO v_academic_year_id
    FROM terms
    WHERE id = p_term_id AND school_id = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Term % not found for school %', p_term_id, p_school_id;
    END IF;

    -- Loop through all enrolled students for this term
    FOR v_rec IN
        SELECT DISTINCT ce.student_id
        FROM class_enrollments ce
        JOIN students s ON s.id = ce.student_id
        WHERE ce.term_id = p_term_id
          AND s.school_id = p_school_id
          AND s.status = 'active'
          AND s.is_deleted = false
          AND ce.is_deleted = false
          AND NOT EXISTS (
              SELECT 1 FROM fee_accounts fa
              WHERE fa.student_id = ce.student_id
                AND fa.term_id = p_term_id
                AND fa.is_deleted = false
          )
    LOOP
        -- Calculate total_expected for this student
        SELECT COALESCE(SUM(fs.amount), 0)
        INTO v_total_expected
        FROM fee_structures fs
        JOIN students st ON st.id = v_rec.student_id
        WHERE fs.term_id = p_term_id
          AND fs.school_id = p_school_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

        -- Calculate discount for this student/term
        SELECT COALESCE(SUM(
          CASE
            WHEN fd.discount_type = 'percentage' THEN
              LEAST(v_total_expected * fd.value / 100, COALESCE(fd.max_amount, v_total_expected * fd.value / 100))
            ELSE fd.value
          END
        ), 0)
        INTO v_total_discount
        FROM student_discounts sd
        JOIN fee_discounts fd ON fd.id = sd.discount_id
        WHERE sd.student_id = v_rec.student_id
          AND (sd.term_id = p_term_id OR sd.term_id IS NULL)
          AND sd.is_deleted = false
          AND fd.is_deleted = false;

        v_total_expected := GREATEST(v_total_expected - v_total_discount, 0);

        INSERT INTO fee_accounts (
            school_id,
            student_id,
            term_id,
            academic_year_id,
            total_expected,
            total_paid,
            balance,
            status
        ) VALUES (
            p_school_id,
            v_rec.student_id,
            p_term_id,
            v_academic_year_id,
            v_total_expected,
            0,
            v_total_expected,
            CASE WHEN v_total_expected > 0 THEN 'unpaid'::fee_account_status ELSE 'paid'::fee_account_status END
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00001_create_enums.sql supabase/migrations/00020_fee_discounts.sql
git commit -m "feat(db): add fee_discounts and student_discounts tables with updated recalc functions"
```

---

### Task 2: TypeScript Types + Zod Validations

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/validations/fees.ts`

- [ ] **Step 1: Add discount types to `types/index.ts`**

Add after the `FeePayment` interface (around line 192):

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

- [ ] **Step 2: Add discount validation schemas to `lib/validations/fees.ts`**

Add after the `feeStatementSchema` (around line 41):

```typescript
export const createDiscountSchema = z.object({
  name: z.string().min(1, 'Discount name is required'),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  value: z.number().positive('Value must be greater than 0'),
  max_amount: z.number().positive().nullable().optional(),
  is_recurring: z.boolean().default(true),
});

export const applyDiscountSchema = z.object({
  student_id: z.string().uuid('Select a student'),
  discount_id: z.string().uuid('Select a discount'),
  term_id: z.string().uuid().nullable(),
  note: z.string().optional().nullable(),
});

export type CreateDiscountFormData = z.infer<typeof createDiscountSchema>;
export type ApplyDiscountFormData = z.infer<typeof applyDiscountSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add types/index.ts lib/validations/fees.ts
git commit -m "feat(types): add FeeDiscount, StudentDiscount types and Zod schemas"
```

---

### Task 3: Discounts API Route

**Files:**
- Create: `app/api/fees/discounts/route.ts`

- [ ] **Step 1: Create the discounts CRUD API route**

Create `app/api/fees/discounts/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { createDiscountSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
      .select(`
        *,
        student_discounts!inner(count)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) return errorResponse(error.message, 500);

    // Fetch student counts separately (Supabase join count can be unreliable)
    const { data: discounts } = await ctx.supabase
      .from("fee_discounts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (!discounts) return successResponse([]);

    // Get student counts per discount
    const discountIds = discounts.map((d) => d.id);
    const { data: countData } = await ctx.supabase
      .from("student_discounts")
      .select("discount_id")
      .in("discount_id", discountIds)
      .eq("is_deleted", false);

    const countMap = new Map<string, number>();
    countData?.forEach((sd) => {
      countMap.set(sd.discount_id, (countMap.get(sd.discount_id) || 0) + 1);
    });

    const result = discounts.map((d) => ({
      ...d,
      student_count: countMap.get(d.id) || 0,
    }));

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const parsed = createDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
        discount_type: parsed.data.discount_type,
        value: parsed.data.value,
        max_amount: parsed.data.max_amount ?? null,
        is_recurring: parsed.data.is_recurring,
      } as any)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "discount_created",
      entity_type: "fee_discount",
      entity_id: data.id,
      new_value: parsed.data,
    } as any);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return errorResponse("Discount ID is required", 400);

    const parsed = createDiscountSchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
      .update(parsed.data as any)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Discount ID is required", 400);

    const { error } = await ctx.supabase
      .from("fee_discounts")
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/fees/discounts/route.ts
git commit -m "feat(api): add fee discounts CRUD route"
```

---

### Task 4: Student-Discounts API Route

**Files:**
- Create: `app/api/fees/student-discounts/route.ts`

- [ ] **Step 1: Create the student-discounts API route**

Create `app/api/fees/student-discounts/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { applyDiscountSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const discountId = searchParams.get("discount_id");

    let query = ctx.supabase
      .from("student_discounts")
      .select(`
        *,
        discount:fee_discounts(*),
        student:students(full_name, current_class_id, classes(name))
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (studentId) query = query.eq("student_id", studentId);
    if (discountId) query = query.eq("discount_id", discountId);

    const { data, error } = await query;

    if (error) return errorResponse(error.message, 500);

    // Transform joined data
    const result = (data || []).map((sd: any) => ({
      ...sd,
      student_name: sd.student?.full_name,
      student_class: sd.student?.classes?.name,
    }));

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const parsed = applyDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Check for duplicate (student + discount + term)
    const { data: existing } = await ctx.supabase
      .from("student_discounts")
      .select("id")
      .eq("student_id", parsed.data.student_id)
      .eq("discount_id", parsed.data.discount_id)
      .eq("term_id", parsed.data.term_id ?? null)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      return errorResponse("This discount is already applied to this student for this term", 400);
    }

    const { data, error } = await ctx.supabase
      .from("student_discounts")
      .insert({
        school_id: schoolId,
        student_id: parsed.data.student_id,
        discount_id: parsed.data.discount_id,
        term_id: parsed.data.term_id ?? null,
        approved_by: ctx.user.id,
        note: parsed.data.note ?? null,
      } as any)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Recalculate fee accounts for affected terms
    if (parsed.data.term_id) {
      // Specific term — recalculate that account
      const { data: account } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", parsed.data.student_id)
        .eq("term_id", parsed.data.term_id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (account) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: account.id,
        });
      }
    } else {
      // All terms — recalculate all accounts for this student
      const { data: accounts } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", parsed.data.student_id)
        .eq("is_deleted", false);

      if (accounts) {
        for (const account of accounts) {
          await ctx.supabase.rpc("recalculate_fee_account", {
            p_account_id: account.id,
          });
        }
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "discount_applied",
      entity_type: "student_discount",
      entity_id: data.id,
      new_value: parsed.data,
    } as any);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Student discount ID is required", 400);

    // Get the discount before deleting (for recalculation)
    const { data: studentDiscount } = await ctx.supabase
      .from("student_discounts")
      .select("student_id, term_id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (!studentDiscount) return errorResponse("Discount not found", 404);

    const { error } = await ctx.supabase
      .from("student_discounts")
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

    // Recalculate affected fee accounts
    if (studentDiscount.term_id) {
      const { data: account } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", studentDiscount.student_id)
        .eq("term_id", studentDiscount.term_id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (account) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: account.id,
        });
      }
    } else {
      const { data: accounts } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", studentDiscount.student_id)
        .eq("is_deleted", false);

      if (accounts) {
        for (const account of accounts) {
          await ctx.supabase.rpc("recalculate_fee_account", {
            p_account_id: account.id,
          });
        }
      }
    }

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/fees/student-discounts/route.ts
git commit -m "feat(api): add student-discounts route with recalculation"
```

---

### Task 5: Update Generate-Accounts Route

**Files:**
- Modify: `app/api/fees/generate-accounts/route.ts`

- [ ] **Step 1: Call `recalculate_fee_account()` after inserting each fee account**

In `app/api/fees/generate-accounts/route.ts`, after the insert block (around line 113), add a call to the DB function to apply discounts:

Replace the insert block (lines 102-113) with:

```typescript
      const { data: newAccount, error } = await ctx.supabase.from("fee_accounts").insert({
        school_id: schoolId,
        student_id: enrollment.student_id,
        term_id: parsed.data.term_id,
        academic_year_id: term!.academic_year_id,
        total_expected: totalExpected,
        total_paid: 0,
        balance: totalExpected,
        status: "unpaid",
      } as any).select("id").single();

      if (!error && newAccount) {
        // Recalculate to apply any discounts
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: newAccount.id,
        });
        created++;
      }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/fees/generate-accounts/route.ts
git commit -m "feat(api): apply discounts during fee account generation"
```

---

### Task 6: Update Edge Function

**Files:**
- Modify: `supabase/functions/fee-account-recalculate/index.ts`

- [ ] **Step 1: Replace inline logic with DB function call**

Replace the entire content of `supabase/functions/fee-account-recalculate/index.ts`:

```typescript
// Supabase Edge Function: fee-account-recalculate
// Calls the recalculate_fee_account() DB function which handles discounts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { fee_account_id } = await req.json();

    if (!fee_account_id) {
      return new Response(
        JSON.stringify({ error: "fee_account_id required" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Call the DB function which handles discount subtraction
    const { error } = await supabase.rpc("recalculate_fee_account", {
      p_account_id: fee_account_id,
    });

    if (error) throw error;

    // Fetch the updated account to return
    const { data: account } = await supabase
      .from("fee_accounts")
      .select("total_expected, total_paid, balance, status")
      .eq("id", fee_account_id)
      .single();

    return new Response(
      JSON.stringify({ success: true, data: account }),
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
git add supabase/functions/fee-account-recalculate/index.ts
git commit -m "feat(edge): use DB function for fee-account-recalculate"
```

---

### Task 7: Discount Management Page

**Files:**
- Create: `app/dashboard/fees/discounts/page.tsx`

- [ ] **Step 1: Create the discount management page**

Create `app/dashboard/fees/discounts/page.tsx` with the full page component following existing fee page patterns (react-query, custom table, navy theme, Dialog for create/edit, Sheet for view students). This is a large file — the key sections are:

1. **Header** with "Fee Discounts" title + Create Discount button
2. **Table** with columns: Name | Type | Value | Max Amount | Recurring | Students | Actions
3. **Create/Edit Dialog** with form fields: name, discount_type select, value, max_amount (conditional on type), is_recurring switch
4. **View Students Sheet** with student list + remove button per row

The page uses `useQuery` for data fetching, `useMutation` for create/update/delete, and follows the navy theme with `bg-navy-800` headers.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/fees/discounts/page.tsx
git commit -m "feat(ui): add discount management page"
```

---

### Task 8: Apply Discount Dialog Component

**Files:**
- Create: `components/fees/apply-discount-dialog.tsx`

- [ ] **Step 1: Create the shared Apply Discount dialog**

Create `components/fees/apply-discount-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { createBrowserClient } from "@/lib/supabase/client";

interface ApplyDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName?: string;
  currentTermId?: string;
}

export function ApplyDiscountDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  currentTermId,
}: ApplyDiscountDialogProps) {
  const [discountId, setDiscountId] = useState("");
  const [termId, setTermId] = useState(currentTermId || "");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  // Fetch available discounts
  const { data: discounts } = useQuery({
    queryKey: ["fee-discounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_discounts")
        .select("*")
        .eq("is_deleted", false)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

  // Fetch terms
  const { data: terms } = useQuery({
    queryKey: ["terms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, name, start_date")
        .eq("is_deleted", false)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: open,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/fees/student-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          discount_id: discountId,
          term_id: termId || null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to apply discount");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Discount applied successfully" });
      queryClient.invalidateQueries({ queryKey: ["student-discounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      onOpenChange(false);
      setDiscountId("");
      setNote("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-navy-100 border-navy-50">
        <DialogHeader>
          <DialogTitle>
            Apply Discount{studentName ? ` — ${studentName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Discount</Label>
            <Select value={discountId} onValueChange={setDiscountId}>
              <SelectTrigger className="bg-navy-900 border-navy-50">
                <SelectValue placeholder="Select discount" />
              </SelectTrigger>
              <SelectContent className="bg-navy-100 border-navy-50">
                {discounts?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.discount_type === "percentage" ? `${d.value}%` : `UGX ${d.value.toLocaleString()}`})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="bg-navy-900 border-navy-50">
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent className="bg-navy-100 border-navy-50">
                <SelectItem value="">All Terms</SelectItem>
                {terms?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for discount..."
              className="bg-navy-900 border-navy-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={!discountId || applyMutation.isPending}
          >
            {applyMutation.isPending ? "Applying..." : "Apply Discount"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/fees/apply-discount-dialog.tsx
git commit -m "feat(ui): add shared ApplyDiscountDialog component"
```

---

### Task 9: Student Page — Fee Tab Integration

**Files:**
- Modify: `app/dashboard/students/[id]/page.tsx`

- [ ] **Step 1: Add discount imports and state**

At the top of the file, add import:

```typescript
import { ApplyDiscountDialog } from "@/components/fees/apply-discount-dialog";
```

Inside the component, add state for the discount dialog and discounts data:

```typescript
const [discountOpen, setDiscountOpen] = useState(false);
const [studentDiscounts, setStudentDiscounts] = useState<any[]>([]);
```

- [ ] **Step 2: Add discount fetching in the fee data useEffect**

In the `useEffect` that loads fee data for the selected term, add a query for student discounts:

```typescript
// Fetch student discounts
const { data: discountsData } = await supabase
  .from("student_discounts")
  .select(`
    *,
    discount:fee_discounts(*)
  `)
  .eq("student_id", studentId)
  .eq("is_deleted", false)
  .or(`term_id.eq.${selectedTermId},term_id.is.null`);
setStudentDiscounts(discountsData || []);
```

- [ ] **Step 3: Add Apply Discount button and discounts list in the Fees tab**

In the Fees tab content, after the stat cards and before the payment history table:

1. Add `[Apply Discount]` button next to `[Record Payment]`
2. Add a discounts list section showing applied discounts with remove buttons

```tsx
{/* Discounts section */}
{studentDiscounts.length > 0 && (
  <div className="mt-4">
    <h4 className="text-sm font-medium text-muted-foreground mb-2">Applied Discounts</h4>
    <div className="space-y-2">
      {studentDiscounts.map((sd) => (
        <div key={sd.id} className="flex items-center justify-between bg-navy-800 rounded-lg px-4 py-2">
          <div>
            <span className="font-medium">{sd.discount?.name}</span>
            <span className="text-muted-foreground ml-2 text-sm">
              {sd.discount?.discount_type === "percentage"
                ? `${sd.discount.value}%`
                : `UGX ${sd.discount?.value?.toLocaleString()}`}
            </span>
            {sd.term_id && (
              <span className="text-muted-foreground ml-2 text-sm">
                — {terms?.find((t) => t.id === sd.term_id)?.name || "Specific Term"}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose hover:text-rose"
            onClick={async () => {
              await fetch(`/api/fees/student-discounts?id=${sd.id}`, { method: "DELETE" });
              // Refresh data
              queryClient.invalidateQueries({ queryKey: ["student-discounts"] });
            }}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add the ApplyDiscountDialog component render**

At the end of the component, add:

```tsx
<ApplyDiscountDialog
  open={discountOpen}
  onOpenChange={setDiscountOpen}
  studentId={studentId}
  studentName={student?.full_name}
  currentTermId={selectedTermId}
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/students/\[id\]/page.tsx
git commit -m "feat(ui): add discount section to student fee tab"
```

---

### Task 10: Fee Accounts Page — Apply Discount Action

**Files:**
- Modify: `app/dashboard/fees/accounts/page.tsx`

- [ ] **Step 1: Add import and state for ApplyDiscountDialog**

Add import at top:

```typescript
import { ApplyDiscountDialog } from "@/components/fees/apply-discount-dialog";
```

Add state:

```typescript
const [discountOpen, setDiscountOpen] = useState(false);
const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
```

- [ ] **Step 2: Add "Apply Discount" action button in the accounts table**

In each table row, add a button that opens the dialog:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => {
    setSelectedStudent({ id: account.student_id, name: account.student?.full_name || "Student" });
    setDiscountOpen(true);
  }}
>
  Apply Discount
</Button>
```

- [ ] **Step 3: Add the dialog render**

```tsx
{selectedStudent && (
  <ApplyDiscountDialog
    open={discountOpen}
    onOpenChange={setDiscountOpen}
    studentId={selectedStudent.id}
    studentName={selectedStudent.name}
    currentTermId={selectedTermId}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/fees/accounts/page.tsx
git commit -m "feat(ui): add apply discount action to fee accounts page"
```

---

### Task 11: Portal — Show Discounts

**Files:**
- Modify: `app/portal/fees/page.tsx`

- [ ] **Step 1: Add discount fetching to the portal fees page**

In the data fetching section, add a query for the student's discounts:

```typescript
const { data: discounts } = await supabase
  .from("student_discounts")
  .select(`
    *,
    discount:fee_discounts(*)
  `)
  .eq("student_id", studentId)
  .eq("is_deleted", false)
  .or(`term_id.eq.${currentTermId},term_id.is.null`);
```

- [ ] **Step 2: Add discounts section to the UI**

Below the fee account summary, add a read-only discounts section:

```tsx
{discounts && discounts.length > 0 && (
  <div className="mt-6">
    <h3 className="text-lg font-semibold mb-3">Discounts</h3>
    <div className="bg-navy-800 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-navy-900 border-b border-navy-700">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium">Discount</th>
            <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-2 text-right text-sm font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {discounts.map((sd) => (
            <tr key={sd.id} className="border-b border-navy-700">
              <td className="px-4 py-2 text-sm">{sd.discount?.name}</td>
              <td className="px-4 py-2 text-sm capitalize">{sd.discount?.discount_type === "percentage" ? "Percentage" : "Fixed Amount"}</td>
              <td className="px-4 py-2 text-sm text-right">
                {sd.discount?.discount_type === "percentage"
                  ? `${sd.discount.value}%`
                  : `UGX ${sd.discount?.value?.toLocaleString()}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/portal/fees/page.tsx
git commit -m "feat(portal): show applied discounts in parent portal"
```

---

### Task 12: Sidebar — Add Discounts Link

**Files:**
- Modify: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add "Discounts" nav item to the Fees children array**

In the `NAV_ITEMS` array, inside the "Fees" children (around line 64), add:

```typescript
{ label: "Discounts", href: "/dashboard/fees/discounts", icon: CreditCard },
```

Place it after "Fee Structure" and before "Fee Accounts".

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/sidebar.tsx
git commit -m "feat(nav): add Discounts link to sidebar"
```

---

### Task 13: Build Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run build**

```bash
cd "C:/Users/Asiimwe Mark Amooti/Desktop/skuli_os" && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Fix any errors found**

If TypeScript or build errors occur, fix them before proceeding.

- [ ] **Step 4: Final commit (if fixes needed)**

```bash
git add -A && git commit -m "fix: resolve build issues from fee discounts feature"
```
